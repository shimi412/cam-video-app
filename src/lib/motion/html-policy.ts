import ts from 'typescript';
/** Deliberately small drawing-language subset. No general browser scripting,
 * dynamic code, arbitrary globals, navigation or network APIs. OS sandbox and
 * CSP remain mandatory; this is defense in depth, not a prompt instruction. */
export function validateMotionHtml(html:string){
 if(/<(?:iframe|object|embed|form|base|link)\b|\bon[a-z]+\s*=|@import|(?:https?:|javascript:|data:text\/html)/i.test(html.replace(/onUpdate/g,'')))throw Error('Unsupported executable or remote markup.');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 if(scripts.length!==2||scripts[0][1].trim()!=='src="assets/gsap.min.js"'||scripts[1][1].trim())throw Error('Only the local animation runtime is allowed.');
 for(const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)/gi))if(!/^assets\/[a-zA-Z0-9_./-]+$/.test(match[1])||match[1].includes('..'))throw Error('Unsupported media path.');
 const file=ts.createSourceFile('motion.js',scripts[1][2],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const allowedCalls=/^(?:gsap\.timeline|tl\.(?:set|to|fromTo)|Math\.(?:abs|round|min|max|sin|cos|floor|ceil)|document\.getElementById|Math\.round\([\w.]+\)\.toLocaleString)$/;
 const visit=(n:ts.Node)=>{
  if(ts.isNewExpression(n)||ts.isImportDeclaration(n)||ts.isWhileStatement(n)||ts.isForStatement(n)||ts.isElementAccessExpression(n)&&n.getText(file)!=='window.__timelines["main"]')throw Error('Unsupported animation expression.');
  if(ts.isPropertyAccessExpression(n)&&['constructor','__proto__','prototype','innerHTML','outerHTML','src','href'].includes(n.name.text))throw Error('Unsafe animation property.');
  if(ts.isCallExpression(n)&&!allowedCalls.test(n.expression.getText(file)))throw Error(`Unsupported animation call: ${n.expression.getText(file).slice(0,60)}`);
  if(ts.isIdentifier(n)&&['fetch','XMLHttpRequest','WebSocket','navigator','location','eval','Function','globalThis','self','top','parent','process','require'].includes(n.text))throw Error('Unsafe animation global.');
  if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.EqualsToken){
   const left=n.left.getText(file);
   if(left!=='window.__timelines["main"]'&&!/^document\.getElementById\("[a-zA-Z0-9_-]+"\)\.textContent$/.test(left))throw Error('Unsupported animation assignment.');
  }
  ts.forEachChild(n,visit);
 };
 visit(file);
}
export function protectedHtml(html:string){validateMotionHtml(html);return html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' \'self\' file:; style-src \'unsafe-inline\'; img-src \'self\' file:; font-src \'self\' file: data:; media-src \'self\' file:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">');}
