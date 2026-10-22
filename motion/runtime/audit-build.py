"""Trusted observer. Run only inside the same OS sandbox as the generated file."""
import ast
import json
import runpy
import sys
from pathlib import Path
p = Path(__file__).parent
# The OS sandbox protects files/network. This additional guard protects the
# audit machinery itself against accidental redefinition by generated code.
source = (p / 'build.py').read_text()
tree = ast.parse(source)
reference = ast.parse((p / 'reference.py').read_text())
fixed = {n.name: ast.dump(n, include_attributes=False) for n in reference.body
         if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
optional = {n.name: ast.dump(n, include_attributes=False) for n in ast.parse((p / 'optional-helpers.py').read_text()).body if isinstance(n, ast.FunctionDef)}
allowed = {**fixed, **optional}
seen = set()
scene_line = source[:source.index('# ============================================================ A')].count('\n') + 1
protected_names = {'P', 'T', 'WD', 'EV', 'TR', 'SC', 'Path', 'json', 'html', 'math', 'random', 'base64'}
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
        if node.name in seen or node.name not in allowed or (ast.dump(node, include_attributes=False) != fixed.get(node.name) and ast.dump(node, include_attributes=False) != optional.get(node.name)):
            raise ValueError('Protected function changed: ' + node.name)
        seen.add(node.name)
    if isinstance(node, ast.Name) and node.id.startswith('__') and node.id != '__file__':
        raise ValueError('Dynamic Python state is forbidden')
    if isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
        raise ValueError('Runtime mutation is forbidden')
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id in protected_names and node.lineno > scene_line:
        raise ValueError('Protected state replacement: ' + node.id)
    if isinstance(node, ast.Attribute) and node.attr.startswith('__'):
        raise ValueError('Dynamic Python attributes are forbidden')
    if isinstance(node, ast.Name) and node.id in {'exec', 'eval', 'compile', 'globals', 'locals', 'vars', 'setattr', 'getattr', '__import__', 'type', 'object', 'help', 'breakpoint'}:
        raise ValueError('Dynamic execution is forbidden')
    if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id in fixed:
        raise ValueError('Protected function assignment: ' + node.id)
if not set(fixed).issubset(seen):
    raise ValueError('Missing protected functions')
# Keep the original imports exactly; the writer has no dependency installation.
imports = lambda t: [ast.dump(n, include_attributes=False) for n in ast.walk(t) if isinstance(n, (ast.Import, ast.ImportFrom))]
if imports(tree) != imports(reference):
    raise ValueError('Generated imports are forbidden')
if sys.argv[1:] == ['--validate-only']:
    sys.exit(0)
g = runpy.run_path(str(p / 'build.py'))
report = {
    'holds': g['check_holds'](),
    'offsets': [g['VIS'][k] - v for k, v in sorted(g['PH'].items())],
    'scenes': [{'id': sid, 'start': v[0], 'end': v[1], 'background': v[2]} for sid, v in g['SC'].items()],
    'duration': g['DUR'], 'logoAt': g['LOGO_NET'],
    # Registered animation events: the review samples frames mid-action from these.
    'events': [{'scene': sc, 't0': t0, 't1': t1, 'label': str(what)[:60]} for (sc, t0, t1, what) in g['EV']],
    # Same rule as check_holds, with the numbers the writer needs to fix each one.
    'holdViolations': [{'scene': a, 'next': b, 'transition': t, 'label': str(what)[:60], 't0': t0, 't1': t1}
                       for (t, d, label, a, b) in sorted(g['TR']) for (sc, t0, t1, what) in g['EV']
                       if sc == a and t1 > t - .6 + 1e-3 and t0 < t - 1e-3],
}
(p / 'build-audit.json').write_text(json.dumps(report))
