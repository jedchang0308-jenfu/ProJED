import { canonicalJsonSha256, canonicalJsonStringify } from '../src/features/taskCollection/canonicalJson';

const vector = {
  b: 1,
  a: 'x',
  nested: [null, true, '中文', '😀', 'a\\b', 'line\n'],
};

const canonical = canonicalJsonStringify(vector);
const sha256 = await canonicalJsonSha256(vector);
console.log(`DEV093_CANONICAL=${JSON.stringify({ canonical, sha256 })}`);
