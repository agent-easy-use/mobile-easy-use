// Shared test vectors; this module does not load Frida or run the fixture.
export const scalarTypes = [
  { name: 'Boolean', java: 'boolean', initial: false, values: [true, false] },
  { name: 'Byte', java: 'byte', initial: 7, values: [-128, 127, -1, 0] },
  { name: 'Char', java: 'char', initial: 'x', values: ['\0', '\uffff', '中', 'B'] },
  { name: 'Short', java: 'short', initial: 7, values: [-32768, 32767, -1, 0] },
  { name: 'Int', java: 'int', initial: 7, values: [-2147483648, 2147483647, -1, 0] },
  { name: 'Long', java: 'long', initial: '7', values: ['9007199254740993', '-9223372036854775808', '9223372036854775807', '-1', '0'] },
  { name: 'Float', java: 'float', initial: 7, values: [1.25, '-0', 'NaN', 'Infinity', '-Infinity'] },
  { name: 'Double', java: 'double', initial: 7, values: [-2.5, '-0', 'NaN', 'Infinity', '-Infinity'] },
  { name: 'String', java: 'java.lang.String', initial: 'old', values: ['新值🙂', '', null] },
  { name: 'Object', java: 'com.agenteasyuse.mobileeasyuse.apidemo.state.JvmtiDebuggerFixture$Box', initial: 'original', values: ['replacement', null] },
];
export const types = [...scalarTypes];
const plurals = ['Booleans', 'Bytes', 'Chars', 'Shorts', 'Ints', 'Longs', 'Floats', 'Doubles', 'Strings'];
scalarTypes.slice(0, 9).forEach((type, i) => types.push({
  name: plurals[i], component: type.name, java: type.java,
  initial: [type.initial], values: [type.values, [], null],
}));
types.push({ name: 'Matrix', component: 'Ints', java: '[I', initial: [[7]], values: [[[1, 2], [], [-3]], [], null] });

export function describe(type, value) {
  if (value === null) return 'null';
  if (type.component) {
    const component = types.find(item => item.name === type.component);
    return JSON.stringify(value.map(item => describe(component, item)));
  }
  if (type.name === 'Char') return String(value.charCodeAt(0));
  if (type.name === 'Float' || type.name === 'Double') {
    const data = new DataView(new ArrayBuffer(8));
    if (type.name === 'Float') {
      data.setFloat32(0, Number(value));
      return 'bits:' + data.getUint32(0).toString(16);
    }
    data.setFloat64(0, Number(value));
    const high = data.getUint32(0), low = data.getUint32(4);
    return 'bits:' + (high ? high.toString(16) + low.toString(16).padStart(8, '0') : low.toString(16));
  }
  return String(value);
}
