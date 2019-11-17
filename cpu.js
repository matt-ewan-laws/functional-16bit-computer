const { cond, equals, T, identity } = require("ramda");

const opCodes = require("./instructions");
const mem = require("./memory");
const { invert } = require("ramda");

const REGISTER_NAMES = [
  "ip",
  "acc",
  "r1",
  "r2",
  "r3",
  "r4",
  "r5",
  "r6",
  "r7",
  "r8"
];

const REGISTER_COUNT = REGISTER_NAMES.length;

const ops = {};

ops.movLitReg = state => {
  state.get("registers");
  const [firstState, literal] = cpu.fetch16(state);
  const [fetchedState, registerRaw] = cpu.fetch(firstState);
  const register = registerRaw % REGISTER_COUNT;
  return fetchedState.setIn(["registers", register], literal);
};

ops.movRegReg = state => {
  const [fromState, registerFromRaw] = cpu.fetch(state);
  const [fetchedState, registerToRaw] = cpu.fetch(fromState);
  const registerFrom = registerFromRaw % REGISTER_COUNT;
  const registerTo = registerToRaw % REGISTER_COUNT;
  const value = fetchedState.getIn(["registers", registerFrom]) || 0;
  return fetchedState.setIn(["registers", registerTo], value);
};

ops.movRegMem = state => {
  const [fromState, registerFromRaw] = cpu.fetch(state);
  const registerFrom = registerFromRaw % REGISTER_COUNT;
  const [fetchedState, address] = cpu.fetch16(fromState);
  const value = state.getIn(["registers", registerFrom]);
  return mem.set16(address, value, fetchedState);
};

ops.movMemReg = state => {
  const [addressState, address] = cpu.fetch16(state);
  const [fetchState, registerToRaw] = cpu.fetch(addressState);
  const register = registerToRaw % REGISTER_COUNT;
  const value = mem.get16(address, state);
  return fetchState.setIn(["registers", register], value);
};

ops.addRegReg = state => {
  const [r1FetchState, r1] = cpu.fetch(state);
  const [fetchedState, r2] = cpu.fetch(r1FetchState);
  const registerValue1 = fetchedState.getIn(["registers", r1]) || 0;
  const registerValue2 = fetchedState.getIn(["registers", r2]) || 0;
  return cpu.setRegister("acc", registerValue1 + registerValue2, fetchedState);
};

ops.jmpNotEq = state => {
  const [valueState, value] = cpu.fetch16(state);
  const [fetchedState, address] = cpu.fetch16(valueState);
  return value !== cpu.getRegister("acc", fetchedState)
    ? cpu.setRegister("ip", address, fetchedState)
    : fetchedState;
};

// CPU functions
// ---------------

/**
 *
 * @param {number} instruction
 */
const getInstructionName = instruction => invert(opCodes)[instruction][0];
console.log(getInstructionName(0x10));

const cpu = {};

cpu.getRegister = (name, state) => {
  const idx = REGISTER_NAMES.indexOf(name);
  return state.getIn(["registers", idx]) || 0;
};

cpu.setRegister = (name, value, state) => {
  const idx = REGISTER_NAMES.indexOf(name);
  return state.setIn(["registers", idx], value);
};

cpu.fetch = state => {
  const nextInstructionAddress = cpu.getRegister("ip", state);
  const instruction = mem.get(nextInstructionAddress, state);
  return [
    cpu.setRegister("ip", nextInstructionAddress + 1, state),
    instruction
  ];
};

cpu.fetch16 = state => {
  const nextInstructionAddress = cpu.getRegister("ip", state);
  const instruction = mem.get16(nextInstructionAddress, state);
  return [
    cpu.setRegister("ip", nextInstructionAddress + 2, state),
    instruction
  ];
};

cpu.showRegisters = state =>
  REGISTER_NAMES.map(name => `${name}: ${cpu.getRegister(name, state)}`);

cpu.execute = (instruction, state) => {
  const instructionMap = [
    [opCodes.MOV_LIT_REG, ops.movLitReg],
    [opCodes.MOV_MEM_REG, ops.movMemReg],
    [opCodes.MOV_REG_REG, ops.movRegReg],
    [opCodes.MOV_REG_MEM, ops.movRegMem],
    [opCodes.ADD_REG_REG, ops.addRegReg],
    [opCodes.JMP_NOT_EQ, ops.jmpNotEq]
  ];

  const makeCond = ([code, fn]) => [equals(code), () => fn];

  const performInstruction = cond([
    ...instructionMap.map(makeCond),
    [T, () => identity]
  ])(instruction);

  console.log("instruction", instruction.toString(16));
  return performInstruction(state);
};

cpu.step = state => {
  const [fetchedState, instruction] = cpu.fetch(state);
  return cpu.execute(instruction, fetchedState);
};

module.exports.getRegister = cpu.getRegister;
module.exports.setRegister = cpu.setRegister;
module.exports.fetch = cpu.fetch;
module.exports.fetch16 = cpu.fetch16;
module.exports.showRegisters = cpu.showRegisters;
module.exports.execute = cpu.execute;
module.exports.step = cpu.step;
module.exports.REGISTER_COUNT = REGISTER_COUNT;
module.exports.REGISTER_NAMES = REGISTER_NAMES;
