const readline = require("readline");
const { fromJS } = require("immutable");

const mem = require("./memory");
const cpu = require("./cpu");
const opCodes = require("./instructions");

const initialState = fromJS({
  registers: [],
  memory: []
}).updateIn(["memory"], m => m.setSize(256));

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
