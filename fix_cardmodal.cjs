const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'CardModal.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The corrupted line 43 merges comment + function declaration on one line.
// We need to replace that corrupted line with the proper declarations + function.
// The corrupted content looks like:
//   "    // \u8a2d\u8a08\u610f\u5716\uff1a\u65e5\u671f input \ufffd    const handlePinToHome = async () => {"
// And lines 44-111 contain the rest of the function correctly.

// Strategy: find and replace the corrupted line (which contains both the comment and the function start)
// Use a regex that matches the corrupted line (the comment fragment + function start on same line)

const corruptedLinePattern = /    \/\/ \u8a2d\u8a08\u610f\u5716\uff1a\u65e5\u671f input .*?const handlePinToHome = async \(\) => \{/;

const replacement = `    // \u2500\u2500\u2500 \u65e5\u671f\u8f38\u5165\u7de9\u885d\u5c64 \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // \u8a2d\u8a08\u610f\u5716\uff1a\u65e5\u671f input \u662f\u300c\u53d7\u63a7\u8f38\u5165\u300d\uff0c\u82e5\u76f4\u63a5\u7d81\u5b9a store \u7684\u5024\uff0c
    // \u5247\u6bcf\u6b21 onChange \u2192 store \u66f4\u65b0 \u2192 \u5143\u4ef6\u91cd\u6e32\u67d3 \u2192 \u8f38\u5165\u6846\u5931\u7126\uff08\u8df3\u638c\uff09\u3002
    // \u89e3\u6cd5\uff1a\u7528 local state \u4f5c\u70ba\u7de9\u885d\uff0conBlur \u6642\u624d\u5beb\u5165 store\u3002
    const [localStartDate, setLocalStartDate] = useState('');
    const [localEndDate, setLocalEndDate] = useState('');
    const currentItemIdRef = useRef<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handlePinToHome = async () => {`;

if (corruptedLinePattern.test(content)) {
  content = content.replace(corruptedLinePattern, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('SUCCESS: Restored corrupted line and missing state declarations.');
} else {
  console.log('Pattern not found. Current content around line 43:');
  const lines = content.split('\n');
  for (let i = 40; i < 50; i++) {
    console.log(`Line ${i+1}: ${JSON.stringify(lines[i])}`);
  }
}
