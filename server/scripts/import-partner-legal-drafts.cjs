// Import literal reference data without executing the supplied TypeScript.
// Usage: node server/scripts/import-partner-legal-drafts.cjs path/to/legalDocuments.ts
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
if (!process.argv[2]) throw new Error('Supply the reviewed legalDocuments.ts source path.');
const source = fs.readFileSync(path.resolve(process.argv[2]), 'utf8');
const ast = ts.createSourceFile('legalDocuments.ts', source, ts.ScriptTarget.Latest, true);
function literal(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(p => {
    if (!ts.isPropertyAssignment(p) || !p.name.text || ['__proto__', 'constructor', 'prototype'].includes(p.name.text)) throw new Error('Non-literal or unsafe source property');
    return [p.name.text, literal(p.initializer)];
  }));
  throw new Error('Unsupported source syntax: ' + ts.SyntaxKind[node.kind]);
}
let documents;
for (const statement of ast.statements) if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (declaration.name.text === 'LEGAL_DOCUMENTS') documents = literal(declaration.initializer);
if (!documents || Object.keys(documents).length !== 4 || Object.values(documents).some(d => d.status !== 'DRAFT_PENDING_REVIEW')) throw new Error('Expected four draft-only legal documents. Active documents require the separate approved-signup-document workflow.');
const result = { source: 'partner.starvnt.com.zip/src/data/legalDocuments.ts', sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), importedOn: new Date().toISOString().slice(0, 10), notice: 'Imported reference drafts. Not active signup documents or approved commercial terms.', documents };
const output = path.resolve(__dirname, '../src/external/data/partnerLegalDrafts.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(`Imported ${Object.keys(documents).length} reference drafts; active signup documents unchanged.`);
