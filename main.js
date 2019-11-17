const readline = require("readline");
const { fromJS } = require("immutable");
const { compose, partial } = require("ramda");

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

const initialState = makeState(512);

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

const startMemory = [
  opCodes.MOV_LIT_REG,
  0x51,
  0x51,
  R1,

  opCodes.MOV_LIT_REG,
  0x42,
  0x42,
  R2,

  opCodes.PSH_REG,
  R1,

  opCodes.PSH_REG,
  R2,

  opCodes.POP,
  R1,

  opCodes.POP,
  R2
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
      .show(500, 12, currentState)
      .map(n => (n !== undefined ? n.toString(16) : "0"))
      .join(" ")
  );
  console.log("\n");
});
