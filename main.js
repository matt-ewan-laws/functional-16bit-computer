const readline = require("readline");
const { fromJS } = require("immutable");

const { cond, equals, T, identity, range } = require("ramda");

const opCodes = require("./instructions");

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

const initialState = fromJS({
  registers: [],
  memory: []
}).updateIn(["memory"], m => m.setSize(256));

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

// CPU functions
// ---------------

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

const history = [];

const IP = 0;
const ACC = 1;
const R1 = 2;
const R2 = 3;

const startMemory = [
  opCodes.MOV_MEM_REG,
  0x01,
  0x00, // 0x0100
  R1,

  opCodes.MOV_LIT_REG,
  0x00,
  0x01,
  R2,

  opCodes.ADD_REG_REG,
  R1,
  R2,

  opCodes.MOV_REG_MEM,
  ACC,
  0x01,
  0x00, // 0x0100

  opCodes.JMP_NOT_EQ,
  0x00,
  0x03,
  0x00,
  0x00
];

const loadedProgramState = mem.setBlock(0, startMemory, initialState);

let currentState = loadedProgramState;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on("line", () => {
  currentState = cpu.step(currentState);
  console.log(cpu.showRegisters(currentState).join("\n"));
  console.log(
    "mem: ",
    mem
      .show(0x0100, 0x0110, currentState)
      .map(n => (n !== undefined ? n.toString(16) : "0"))
      .join(" ")
  );
  console.log("\n");
});
