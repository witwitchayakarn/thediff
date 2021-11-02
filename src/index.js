const fs = require('fs');
const os = require('os');
const path = require('path');

const { SAME_FILE, SAME_FUNC, IGNORE } = require('./types/const');
const { isString, isObject } = require('./utils');

const bcwVsBcmRule = require('./rules/brace-client-web-vs-brace-client-mobile');

const includeLines = (lines, startLine, endLine) => {
  const i = lines.indexOf(startLine);
  if (i < 0) throw new Error(`Not found include startLine: ${startLine}`);

  const j = lines.indexOf(endLine, i);
  if (j < 0) throw new Error(`Not found include endLine: ${endLine}`);

  return lines.slice(i, j + 1);
};

const _getIncluded = (linesA, linesB, include) => {
  if (include.startLine && include.endLine) {
    linesA = includeLines(linesA, include.startLine, include.endLine);
    linesB = includeLines(linesB, include.startLine, include.endLine);
    return { linesA, linesB };
  }
  throw new Error(`Invalid include: ${JSON.stringify(include)}`);
};

const getIncluded = (linesA, linesB, include) => {
  if (Array.isArray(include)) {
    const iLinesA = [], iLinesB = [];
    for (const _include of include) {
      const included = _getIncluded(linesA, linesB, _include);
      iLinesA.push(...included.linesA);
      iLinesB.push(...included.linesB);
    }
    return { linesA: iLinesA, linesB: iLinesB };
  }

  if (isObject(include)) {
    return _getIncluded(linesA, linesB, include);
  }

  throw new Error(`Invalid include value: ${JSON.stringify(include)}`);
};

const excludeLines = (lines, startLine, endLine) => {
  while (true) {
    const i = lines.indexOf(startLine);
    if (i < 0) break;

    const j = lines.indexOf(endLine, i);
    if (j < 0) throw new Error(`Not found exclude endLine: ${endLine}`);

    lines = [...lines.slice(0, i), ...lines.slice(j + 1)];
  }
  return lines;
};

const _getExcluded = (linesA, linesB, exclude) => {
  // line, startLine and endLine can't be empty string.
  // if lineA or lineB is empty, mean do nothing.

  if (exclude.line) {
    linesA = linesA.filter(line => line !== exclude.line);
    linesB = linesB.filter(line => line !== exclude.line);
    return { linesA, linesB };
  }
  if (exclude.startLine && exclude.endLine) {
    linesA = excludeLines(linesA, exclude.startLine, exclude.endLine);
    linesB = excludeLines(linesB, exclude.startLine, exclude.endLine);
    return { linesA, linesB };
  }
  if ('lineA' in exclude) {
    if (exclude.lineA) linesA = linesA.filter(line => line !== exclude.lineA);
    if ('lineB' in exclude) {
      if (exclude.lineB) linesB = linesB.filter(line => line !== exclude.lineB);
      return { linesA, linesB };
    }
    if (exclude.startLineB && exclude.endLineB) {
      linesB = excludeLines(linesB, exclude.startLineB, exclude.endLineB);
      return { linesA, linesB };
    }
  }
  if (exclude.startLineA && exclude.endLineA) {
    linesA = excludeLines(linesA, exclude.startLineA, exclude.endLineA);
    if ('lineB' in exclude) {
      if (exclude.lineB) linesB = linesB.filter(line => line !== exclude.lineB);
      return { linesA, linesB };
    }
    if (exclude.startLineB && exclude.endLineB) {
      linesB = excludeLines(linesB, exclude.startLineB, exclude.endLineB);
      return { linesA, linesB };
    }
  }
  throw new Error(`Invalid exclude: ${JSON.stringify(exclude)}`);
};

const getExcluded = (linesA, linesB, exclude) => {
  if (Array.isArray(exclude)) {
    for (const _exclude of exclude) {
      ({ linesA, linesB } = _getExcluded(linesA, linesB, _exclude));
    }
    return { linesA, linesB };
  }

  if (isObject(exclude)) {
    return _getExcluded(linesA, linesB, exclude);
  }

  throw new Error(`Invalid exclude value: ${JSON.stringify(exclude)}`);
};

const compareSameFile = (linesA, linesB, rule, info) => {

  if (rule.include) ({ linesA, linesB } = getIncluded(linesA, linesB, rule.include));
  if (rule.exclude) ({ linesA, linesB } = getExcluded(linesA, linesB, rule.exclude));

  let diffA = null, diffB = null;
  const l = Math.max(linesA.length, linesB.length);
  for (let i = 0; i < l; i++) {
    if (linesA[i] !== linesB[i]) {
      diffA = linesA[i];
      diffB = linesB[i];
      break;
    }
  }

  if (diffA !== diffB) {
    console.log(`${info.dirA}`)
    console.log(`${info.nameA} v.s. ${info.nameB}`);
    console.log(`A: ${diffA}`);
    console.log(`B: ${diffB}`);
    console.log('----------------------------------------------------------------');
  }
};

const compareSameFunc = () => {

};

const getCompared = (dirA, nameA, dirB, nameB, rule) => {
  const fpathA = path.join(dirA, nameA);
  const fpathB = path.join(dirB, nameB);

  const linesA = fs.readFileSync(fpathA, 'utf-8').trim().split('\n');
  const linesB = fs.readFileSync(fpathB, 'utf-8').trim().split('\n');
  const cRule = isString(rule) ? { name: rule } : rule;
  const info = { dirA, nameA, dirB, nameB };

  if (cRule.name === SAME_FILE) compareSameFile(linesA, linesB, cRule, info)
  else if (cRule.name === SAME_FUNC) compareSameFunc();
  else throw new Error(`Invalid compare rule: ${JSON.stringify(rule)}`);
};

const _getMatched = (name, rule, sideName = 'nameA', oppName = 'nameB') => {
  if (isObject(rule)) {
    if (rule.nameA || rule.nameB) {
      if (!rule.nameA || !rule.nameB) {
        throw new Error(`Require both nameA and nameB on rule: ${JSON.stringify(rule)}`);
      }
      if (rule[sideName] === name) {
        return { [sideName]: name, [oppName]: rule[oppName], rule };
      }
      return null;
    }

    if (Array.isArray(rule.name)) {
      if (rule.name.includes(name)) {
        return { [sideName]: name, [oppName]: name, rule };
      }
      return null;
    }

    if (isString(rule.name)) {
      if (rule.name === name || rule.name === '*') {
        return { [sideName]: name, [oppName]: name, rule };
      }
      return null;
    }
  }

  throw new Error(`Invalid rule: ${JSON.stringify(rule)}`);
};

const getMatched = (name, rule, sideName = 'nameA', oppName = 'nameB') => {
  if (Array.isArray(rule)) {
    for (const _rule of rule) {
      const matched = _getMatched(name, _rule, sideName, oppName);
      if (matched) return matched;
    }
  }

  if (isObject(rule)) {
    const matched = _getMatched(name, rule, sideName, oppName);
    if (matched) return matched;
  }

  throw new Error(`getMatched not found with name: ${name}, rule: ${JSON.stringify(rule)}, sideName: ${sideName}, oppName: ${oppName}.`);
};

const _traverse = (dirA, nameA, dirB, nameB, rule) => {
  if (rule.rule === IGNORE) return;

  const fpathA = path.join(dirA, nameA);
  const lstatA = fs.lstatSync(fpathA)

  const fpathB = path.join(dirB, nameB);
  const lstatB = fs.lstatSync(fpathB)

  if (lstatA.isFile() && lstatB.isFile()) {
    getCompared(dirA, nameA, dirB, nameB, rule.rule);
    return;
  }

  if (lstatA.isDirectory() && lstatB.isDirectory()) {
    const childrenA = fs.readdirSync(fpathA);
    const childrenB = fs.readdirSync(fpathB);

    const pairs = [];
    for (const childA of childrenA) {
      pairs.push(getMatched(childA, rule.rule));
    }
    for (const childB of childrenB) {
      if (pairs.some(v => v.nameB === childB)) continue;
      pairs.push(getMatched(childB, rule.rule, 'nameB', 'nameA'));
    }

    for (const pair of pairs) {
      _traverse(fpathA, pair.nameA, fpathB, pair.nameB, pair.rule);
    }
    return;
  }

  throw new Error(`Invalid traverse with fpathA: ${fpathA}, fpathB: ${fpathB}, rule: ${JSON.stringify(rule)}`);
};

const traverse = (root) => {
  const homeDir = os.homedir();

  const arrA = root.nameA.trim().split('/');
  const dirA = arrA.slice(0, arrA.length - 1).join('/').replace('~', homeDir);
  const nameA = arrA[arrA.length - 1];

  const arrB = root.nameB.trim().split('/');
  const dirB = arrB.slice(0, arrB.length - 1).join('/').replace('~', homeDir);
  const nameB = arrB[arrB.length - 1];

  _traverse(dirA, nameA, dirB, nameB, root);
};

const main = () => {
  traverse(bcwVsBcmRule);
};

main();