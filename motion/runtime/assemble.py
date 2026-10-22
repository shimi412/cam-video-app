"""Parse (never execute) author code; splice only composition and data into our engine.
Legacy full-file answers are supported. Their footer implementations are discarded.
The caller executes the result only through audit-build.py in the OS sandbox.
"""
import ast
import json
import sys

request = json.load(sys.stdin)
source, reference = request['source'], request['reference']
marker = '# ============================================================ A'
boundary = '# ------------------------------------------------------------ sous-titres'
if marker not in source or boundary not in source:
    missing = marker if marker not in source else boundary
    raise ValueError(f'The protected line {missing!r} is missing from the source. It is application-owned: keep it byte-identical, with the composition before the subtitle boundary and SUBS, VIS and MARKS data after it.')
start, end = source.index(marker), source.index(boundary)
if end <= start:
    raise ValueError('Invalid composition boundaries')
body = source[start:end]
# A model may repeat the worked example's prelude. Discard only AST-identical
# top-level copies before the first scene; never execute or relax changed helpers.
fixed_tree = ast.parse(request['prefix'])
fixed_statements = {ast.dump(n, include_attributes=False) for n in fixed_tree.body}
body_tree = ast.parse(body)
body_lines = body.splitlines(keepends=True)
copies = []
for n in body_tree.body:
    if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and isinstance(n.value.func, ast.Name) and n.value.func.id == 'scene':
        break
    if isinstance(n, (ast.FunctionDef, ast.Assign)) and ast.dump(n, include_attributes=False) in fixed_statements:
        copies.append((n.lineno - 1, n.end_lineno))
for a, b in reversed(copies):
    body_lines[a:b] = ['\n'] * (b-a)
body = ''.join(body_lines)
# Authoring cannot redefine a runtime helper, including by a new name.
for n in ast.walk(ast.parse(body)):
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom)):
        detail = ast.get_source_segment(body, n).splitlines()[0][:180]
        raise ValueError(f'Composition line {n.lineno}: {detail}. Use the supplied helper instead; remove this definition/import. Only exact prelude copies can be discarded automatically.')
parsed = ast.parse(source)
line = source[:end].count('\n') + 1
config = {}
for n in parsed.body:
    if n.lineno < line:
        continue
    if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) and n.targets[0].id in {'SUBS', 'VIS', 'MARKS'}:
        key = n.targets[0].id
        if key in config:
            raise ValueError('Repeated configuration: ' + key)
        config[key] = n.value
    # Legacy writers placed their sound data directly inside json.dump.
    if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and ast.unparse(n.value.func) == 'json.dump' and n.value.args and isinstance(n.value.args[0], ast.Dict):
        if 'MARKS' in config:
            raise ValueError('Repeated sound configuration')
        config['MARKS'] = n.value.args[0]
if set(config) != {'SUBS', 'VIS', 'MARKS'}:
    raise ValueError('Composition requires SUBS, VIS and MARKS configuration data.')
# Diagnose the exchange before executing the trusted footer. Previously a
# scene-keyed VIS overwrote the phrase map and surfaced only as KeyError: 1.
vis = config['VIS']
expected = {s['phrase'] for s in request['scenes']}
# The application owns PH and the data lines after the subtitle boundary. Any
# VIS/PH assignment inside the composition is overwritten there, so the only
# arrival times that count are those of this data line.
vis_note = (' Only the VIS data line after the subtitle boundary is used; VIS/PH assignments inside the'
            ' composition are ignored. Write VIS = {1: <expr>, 2: <expr>, ...} with one integer phrase ID'
            ' per narration phrase and unquoted expressions over names defined in the composition, e.g. {1: ws(0), 2: TB0}.')
if not isinstance(vis, ast.Dict) or any(not isinstance(k, ast.Constant) or type(k.value) is not int for k in vis.keys):
    raise ValueError('VIS must map integer narration phrase IDs to numeric arrival times, e.g. {1: ws(0), 2: TB0}. Scene IDs such as sA and quoted expressions are not timing values.' + vis_note)
keys = [k.value for k in vis.keys]
if len(keys) != len(set(keys)) or set(keys) != expected:
    raise ValueError('VIS needs exactly these phrase IDs: ' + ', '.join(map(str, sorted(expected))) + '.' + vis_note)
if any(any(isinstance(n, ast.Constant) and isinstance(n.value, str) for n in ast.walk(v)) for v in vis.values):
    raise ValueError('VIS arrival times must be numbers or numeric expressions, never quoted expressions.' + vis_note)
# These expressions can refer to composition times but cannot run general code.
for name, expression in config.items():
    for n in ast.walk(expression):
        if isinstance(n, (ast.Lambda, ast.NamedExpr, ast.Await, ast.Yield)):
            raise ValueError('Executable configuration: ' + name)
        if isinstance(n, ast.Call) and not (isinstance(n.func, ast.Name) and n.func.id in {'ws', 'we', 'min', 'max', 'round', 'sorted'}):
            raise ValueError('Unsupported configuration call: ' + name)
# Every caption must be actual narration, at a readable lower safe position.
subs = ast.literal_eval(config['SUBS'])
if not isinstance(subs, list) or not subs:
    raise ValueError('Provide subtitle groups for the narration')
for entry in subs:
    if not isinstance(entry, (tuple, list)) or len(entry) != 2 or not isinstance(entry[0], str) or entry[1] != 1340:
        raise ValueError('Subtitles use (narration excerpt, 1340) groups')
# The full narration matcher in our fixed helper rejects invented caption copy.
footer = reference[reference.index(boundary):]
footer_tree = ast.parse(footer)
lines = footer.splitlines(keepends=True)
replacements = []
for n in footer_tree.body:
    key = n.targets[0].id if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name) else None
    if key in {'SUBS', 'VIS'}:
        replacements.append((n.lineno-1, n.end_lineno, key + ' = ' + ast.unparse(config[key]) + '\n'))
    if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and ast.unparse(n.value.func) == 'json.dump':
        marks = config['MARKS']
        if not isinstance(marks, ast.Dict) or any(not isinstance(k, ast.Constant) or not isinstance(k.value, str) for k in marks.keys):
            raise ValueError('MARKS must be a dictionary with named sound cues, e.g. {\'sober\': [T_F, T_G], \'logo_impact\': LAND}')
        provided = {k.value: v for k, v in zip(marks.keys, marks.values)}
        if any(isinstance(v, ast.Constant) and isinstance(v.value, str) for v in provided.values()) or any(
                isinstance(v, (ast.List, ast.Tuple)) and any(isinstance(e, ast.Constant) and isinstance(e.value, str) for e in v.elts) for v in provided.values()):
            raise ValueError('MARKS values are numbers or unquoted expressions over names defined in the composition, never quoted strings.')
        missing = {'sober', 'logo_impact'} - set(provided)
        if missing:
            raise ValueError('MARKS must include ' + ', '.join(sorted(missing)) + ': sober is [start, end] of the calm passage, logo_impact is when the logo lands.')
        if not isinstance(provided['sober'], (ast.List, ast.Tuple)) or len(provided['sober'].elts) != 2:
            raise ValueError('MARKS sober must be [start, end] of the single calm passage.')
        # Transitions come from the registered iris/band/pan/recede_black calls,
        # dur and logo_net from the application-owned values. A model-supplied
        # version of those is ignored, never trusted over the composition itself.
        # Legacy answers sometimes omit the two finishing accents. Infer those
        # from their actual final scene, never copy reference word indices.
        last_scene = request['scenes'][-1]['id']
        defaults = {'plot': f'SC[{last_scene!r}][0]', 'q_final': 'LOGO_NET - 1.0', 'logo_net': 'LOGO_NET', 'dur': 'DUR'}
        entries = ['"transitions": [{"t": round(t, 3), "d": d, "technique": l, "de": a, "vers": b} for (t, d, l, a, b) in sorted(TR)]']
        for key in ['sober', 'plot', 'q_final', 'logo_impact', 'logo_net', 'strike', 'counter', 'terrible', 'dur']:
            if key in ('logo_net', 'dur'):
                value = ast.parse(defaults[key], mode='eval').body
            elif key in provided:
                value = provided[key]
                if isinstance(value, ast.Constant) and value.value is None:
                    continue
            elif key in defaults:
                value = ast.parse(defaults[key], mode='eval').body
            else:
                continue
            entries.append(f'{key!r}: {ast.unparse(value)}')
        replacements.append((n.lineno-1,n.end_lineno,'json.dump({' + ', '.join(entries) + '}, open(P / "marks.json", "w"), indent=1, ensure_ascii=False)\n'))
for a,b,text in reversed(replacements):
    lines[a:b] = [text]
print(json.dumps({'source':request['prefix'] + body + ''.join(lines)},ensure_ascii=False))
