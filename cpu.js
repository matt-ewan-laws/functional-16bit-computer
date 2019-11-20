const {
  cond,
  equals,
  T,
  identity,
  apply,
  pipe,
  partial,
  tap,
  range
} = require("ramda");

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
  "r8",
  "sp",
  "fp"
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

ops.pshLit = state => {
  const [fetchedState, value] = cpu.fetch16(state);
  return cpu.push(value, fetchedState);
};

ops.pop = state => {
  const pipeline = [
    state => cpu.fetchRegisterIndex(state),
    ([state, registerIndex]) => [cpu.pop(state), registerIndex],
    ([[state, value], registerIndex]) =>
      state.setIn(["registers", registerIndex], value)
  ];
  return pipe(...pipeline)(state);
};

ops.pshReg = state => {
  const [fetchedState, registerIndex] = cpu.fetchRegisterIndex(state);
  return cpu.push(
    fetchedState.getIn(["registers", registerIndex]),
    fetchedState
  );
};

ops.jmpNotEq = state => {
  const [valueState, value] = cpu.fetch16(state);
  const [fetchedState, address] = cpu.fetch16(valueState);
  return value !== cpu.getRegister("acc", fetchedState)
    ? cpu.setRegister("ip", address, fetchedState)
    : fetchedState;
};

ops.calLit = state => {
  const chain = [
    state => cpu.fetch16(state),
    ([state, address]) => [cpu.pushState(state), address],
    ([state, address]) => cpu.setRegister("ip", address, state)
  ];
  return pipe(...chain)(state);
};

ops.calReg = state => {
  const pipeline = [
    state => cpu.fetchRegisterIndex(state),
    ([state, registerIndex]) => [
      state,
      state.getIn(["registers", registerIndex])
    ],
    ([state, address]) => [cpu.pushState(state), address],
    ([state, address]) => [cpu.setRegister(state, address)]
  ];
  return pipe(...pipeline)(state);
};

ops.ret = state => cpu.popState(state);

// CPU functions
// ---------------

/**
 *
 * @param {number} instruction
 */
const getInstructionName = instruction => {
  const inverted = invert(opCodes);
  if (inverted[instruction]) {
    return inverted[instruction][0];
  }
  return "NOOP";
};

const cpu = {};

cpu.fetchRegisterIndex = state => {
  const [fetchedState, rawIndex] = cpu.fetch(state);
  return [fetchedState, rawIndex % REGISTER_COUNT];
};

cpu.getRegister = (name, state) => {
  const idx = REGISTER_NAMES.indexOf(name);
  return state.getIn(["registers", idx]) || 0;
};

cpu.setRegister = (name, value, state) => {
  const idx = REGISTER_NAMES.indexOf(name);
  const newState = state.setIn(["registers", idx], value);
  return newState;
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

cpu.changeStack = (modification, state) => {
  const prevStack = state.get("stackFrameSize");
  return state.set("stackFrameSize", prevStack + modification);
};

cpu.push = (value, state) => {
  const pipeline = [
    state => [state, cpu.getRegister("sp", state)],
    ([state, spAddress]) => [mem.set16(spAddress, value, state), spAddress],
    ([state, spAddress]) => cpu.setRegister("sp", spAddress - 2, state),
    state => cpu.changeStack(2, state)
  ];
  return pipe(...pipeline)(state);
};

cpu.pushState = state => {
  const registers = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "ip"];
  const functions = [
    ...registers.map(r => state => cpu.push(cpu.getRegister(r, state), state)),
    state => cpu.push(state.get("stackFrameSize") + 2, state),
    state => cpu.setRegister("fp", cpu.getRegister("sp", state), state)
  ];
  const pushAll = pipe(...functions);

  return pushAll(state);
};

const popN = (n, state) => {
  if (n > 0) {
    const miniPop = s => cpu.pop(s)[0];
    const fns = range(0, n).map(i => miniPop);
    const popAll = pipe(...fns);
    return popAll(state);
  }
  return state;
};

cpu.pop = state => {
  const pipeline = [
    state => [state, cpu.getRegister("sp", state) + 2],
    ([state, nextSpAddress]) => [
      cpu.setRegister("sp", nextSpAddress, state),
      nextSpAddress
    ],
    ([state, nextSpAddress]) => [cpu.changeStack(-2, state), nextSpAddress],
    ([state, nextSpAddress]) => [state, mem.get16(nextSpAddress, state)]
  ];
  return pipe(...pipeline)(state);
};

const popRegister = register => state => {
  const [popped, val] = cpu.pop(state);
  return cpu.setRegister(register, val, popped);
};

cpu.popState = state => {
  const framePointerAddress = cpu.getRegister("fp", state);
  const popRegisters = pipe(
    ...["ip", "r8", "r7", "r6", "r5", "r4", "r3", "r2", "r1"].map(popRegister)
  );

  const pipeline = [
    state => cpu.setRegister("sp", framePointerAddress, state),
    state => cpu.pop(state),
    ([state, stackFrameSize]) => {
      return [popRegisters(state), stackFrameSize];
    },
    ([state, stackFrameSize]) => [cpu.pop(state), stackFrameSize],
    ([[state, nArgs], stackFrameSize]) => {
      return [popN(nArgs, state), stackFrameSize];
    },
    ([state, stackFrameSize]) =>
      cpu.setRegister("fp", framePointerAddress + stackFrameSize, state)
  ];
  return pipe(...pipeline)(state);
};

cpu.showRegisters = state =>
  REGISTER_NAMES.map(
    name => `${name}: ${cpu.getRegister(name, state).toString(16)}`
  );

cpu.execute = (instruction, state) => {
  const instructionMap = [
    [opCodes.MOV_LIT_REG, ops.movLitReg],
    [opCodes.MOV_MEM_REG, ops.movMemReg],
    [opCodes.MOV_REG_REG, ops.movRegReg],
    [opCodes.MOV_REG_MEM, ops.movRegMem],
    [opCodes.ADD_REG_REG, ops.addRegReg],
    [opCodes.PSH_LIT, ops.pshLit],
    [opCodes.PSH_REG, ops.pshReg],
    [opCodes.POP, ops.pop],
    [opCodes.JMP_NOT_EQ, ops.jmpNotEq],
    [opCodes.CAL_LIT, ops.calLit],
    [opCodes.CAL_REG, ops.calReg],
    [opCodes.RET, ops.ret]
  ];

  const makeCond = ([code, fn]) => [equals(code), () => fn];

  const performInstruction = cond([
    ...instructionMap.map(makeCond),
    [T, () => identity]
  ])(instruction);

  console.log(getInstructionName(instruction));
  // console.log("instruction", instruction.toString(16));
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
