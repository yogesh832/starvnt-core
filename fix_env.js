const fs = require('fs');
let content = fs.readFileSync('server/.env', 'utf8');
// Remove null bytes which powershell injected
content = content.replace(/\x00/g, '');
// Remove the broken OPENAI lines and anything after
const idx = content.indexOf('O P E N A I');
if (idx !== -1) {
    content = content.substring(0, idx);
}
const idx2 = content.indexOf('OPENAI');
if (idx2 !== -1) {
    content = content.substring(0, idx2);
}

content += `\nOPENAI_API_KEY="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"\n`;
content += `ELEVENLABS_API_KEY="sk_1072fd08365cb278b5fe51bc0c1dd822d62c23a2f95aa3e8"\n`;

fs.writeFileSync('server/.env', content, 'utf8');
console.log('Fixed .env');
