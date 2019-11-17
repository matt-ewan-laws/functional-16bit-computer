// Memory functions
// ---------------

const mem = {};

mem.get = (address, state) => state.getIn(["memory", address]) || 0;

mem.get16 = (address, state) => {
  const first = state.getIn(["memory", address]) || 0;
  const second = state.getIn(["memory", address + 1]) || 0;
  // smoosh them together
  return (first << 8) | second;
};

mem.set = (address, value, state) => state.setIn(["memory", address], value);

mem.set16 = (address, value, state) => {
  const first = value >> 8;
  const second = value & 0x00ff;
  return state
    .setIn(["memory", address], first)
    .setIn(["memory", address + 1], second);
};

mem.show = (address, length, state) => {
  return state
    .get("memory")
    .slice(address, address + length)
    .toArray();
};

mem.setBlock = (address, values, state) => {
  const len = values.length;
  const memory = state
    .get("memory")
    .splice(address, len)
    .splice(address, 0, ...values);
  return state.set("memory", memory);
};

module.exports = {
  ...mem
};
