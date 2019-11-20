const readline = require("readline");
const { fromJS } = require("immutable");
const { compose, partial, pipe } = require("ramda");

const mem = require("./memory");
const cpu = require("./cpu");
const opCodes = require("./instructions");

const makeState = memSize => {
  const setRegisters = compose(
    partial(cpu.setRegister, ["sp", memSize - 2]),
    partial(cpu.setRegister, ["fp", memSize - 2])
  );
  const initial = fromJS({
    registers: [],
    memory: [],
    stackFrameSize: 0
  }).updateIn(["memory"], m => m.setSize(memSize));
  return setRegisters(initial);
};

const initialState = makeState(256 * 256);

const history = [];

const IP = 0;
const ACC = 1;
const R1 = 2;
const R2 = 3;
const R3 = 4;
const R4 = 5;
const R5 = 6;
const R6 = 7;
const R7 = 8;
const R8 = 9;
const SP = 10;
const FP = 11;

const subroutineAddress = 0x3000;

const startMemory = [
  opCodes.PSH_LIT, // 0
  0x33,
  0x33,

  opCodes.PSH_LIT, // 3
  0x22,
  0x22,

  opCodes.PSH_LIT, // 6
  0x11,
  0x11,

  opCodes.MOV_LIT_REG, // 9
  0x12,
  0x34,
  R1,

  opCodes.MOV_LIT_REG, // 13
  0x56,
  0x78,
  R4,

  opCodes.PSH_LIT, // 17
  0x00,
  0x00,

  opCodes.CAL_LIT, // 20
  (subroutineAddress & 0xff00) >> 8,
  subroutineAddress & 0x00ff,

  opCodes.PSH_LIT, // 23
  0x44,
  0x44
];

const subroutine = [
  opCodes.PSH_LIT, // 26
  0x01,
  0x02,

  opCodes.PSH_LIT, // 29
  0x03,
  0x04,

  opCodes.PSH_LIT, // 32
  0x05,
  0x06,

  opCodes.MOV_LIT_REG,
  0x07,
  0x08,
  R1,

  opCodes.MOV_LIT_REG,
  0x09,
  0x0a,
  R8,

  opCodes.RET
];

const loadedProgramState = pipe(
  ...[
    state => mem.setBlock(0, startMemory, state),
    state => mem.setBlock(subroutineAddress, subroutine, state)
  ]
)(initialState);

let currentState = loadedProgramState;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on("line", () => {
  currentState = cpu.step(currentState);
  const nextMem = cpu.getRegister("ip", currentState);
  console.log(cpu.showRegisters(currentState).join("\n"));
  console.log(
    `mem: (${nextMem.toString(16)}) `,
    mem
      .show(nextMem, 40, currentState)
      .map(n => (n !== undefined ? n.toString(16) : "0"))
      .join(" ")
  );
  const peekAt = 0xffff - 1 - 42;
  console.log(
    `mem: (${peekAt.toString(16)})`,
    mem
      .show(peekAt, 44, currentState)
      .map(n => (n !== undefined ? n.toString(16) : "0"))
      .join(" ")
  );
  console.log("\n");
});
