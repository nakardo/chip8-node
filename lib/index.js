
/**
 * Module exports.
 */

module.exports = Chip8;

/**
 * Chip8 constructor.
 *
 * @param {Object} options
 */

function Chip8(opts) {
  if (!(this instanceof Chip8)) {
    return new Chip8(opts);
  }

  opts = opts || {};
  this.renderer = opts.renderer;
  this.loader = opts.loader;

  /**
   * Chip8 components.
   */

  this.memory = new Uint8Array(0x1000);
  this.stack = new Array(16);

  /**
   * Chip8 registers.
   */

  this.v = new Array(16);
  this.i = null;
  this.dt = null;
  this.st = null;

  /**
   * Chip8 pseudo-registers.
   */

  this.pc = null;
  this.sp = null;

  /**
   * Emulator logic.
   */

  this.running = false;

  /**
   * Display.
   */

  this.displayWidth = 64;
  this.displayHeight = 32;
  this.display = new Array(this.displayWidth * this.displayHeight);

  this.reset();
}

/**
 * Loads a program.
 *
 * @param {Object} options to be passed to loader.
 * @param {Function} callback to be invoked when program was loaded.
 * @return {Chip8} self
 */

Chip8.prototype.load = function(opts, cb) {
  var that = this;
  this.loader.load(opts, function(err, p) {
    for (var i = 0; i < p.length; i++) {
      that.memory[0x200 + i] = p[i];
    }

    cb(err);
  });

  return this;
};

/**
 * Resets the emulator.
 *
 * @return {Chip8} self
 */

Chip8.prototype.reset = function() {
  var i;

  // Reset memory.
  for (i = 0; i < this.memory.length; i++) {
    this.memory[i] = 0;
  }

  /**
   * Load sprites
   *
   * Programs may also refer to a group of sprites representing the hexadecimal
   * digits 0 through F. These sprites are 5 bytes long, or 8x5 pixels. The data
   * should be stored in the interpreter area of Chip-8 memory (0x000 to 0x1FF).
   */
  var hexDigits = [
    0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
    0x90, 0x90, 0xF0, 0x10, 0xF0, // 4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
    0xF0, 0x10, 0x20, 0x40, 0x40, // 7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
    0xF0, 0x90, 0xF0, 0x90, 0x90, // A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
    0xF0, 0x80, 0x80, 0x80, 0xF0, // C
    0xE0, 0x90, 0x90, 0x90, 0xE0, // D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
    0xF0, 0x80, 0xF0, 0x80, 0x80  // F
  ];
  for (i = 0; i < hexDigits.length; i++) {
    this.memory[i] = hexDigits[i];
  }

  // Reset registers.
  for (i = 0; i < this.v.length; i++) {
    this.v[i] = 0;
  }
  this.i = 0;
  this.dt = 0;
  this.st = 0;

  // Reset pseudo-registers.
  this.pc = 0x200;
  this.sp = 0;

  // Reset display.
  for (i = 0; i < this.display.length; i++) {
    this.display[i] = 0;
  }

  this.running = false;

  return this;
};

/**
 * Starts the emulator.
 *
 * @return {Chip8} self
 */

Chip8.prototype.start = function() {
  this.running = true;

  var that = this;
  this.loop = setInterval(function() {
    if (that.running) {
      that.runCycle();
    }

    if (that.requestRender) {
      that.renderer.render(that.display);
      that.requestRender = false;
    }
  }, 1000 / 30);

  return this;
};

/**
 * Stops the emulator.
 */

Chip8.prototype.stop = function() {
  clearInterval(this.loop);
};

/**
 * Runs a cycle.
 */

Chip8.prototype.runCycle = function() {
  var opcode = this.memory[this.pc] << 8 | this.memory[this.pc + 1]
    , addr = opcode & 0xFFF
    , x = (opcode & 0xF00) >> 8
    , y = (opcode & 0xF0) >> 4
    , byte = opcode & 0xFF;

  var i;

  console.log(this.pc, opcode.toString(16));

  this.pc += 2;

  switch (opcode & 0xF000) {
    case 0:
      switch (opcode) {

        /**
         * 00E0 - CLS
         * Clear the display.
         */

        case 0xE0:
          this.renderer.clear();
          break;

        /**
         * 00EE - RET
         * Return from a subroutine.
         *
         * The interpreter sets the program counter to the address at the top
         * of the stack, then subtracts 1 from the stack pointer.
         */

        case 0xEE:
          this.pc = this.stack[--this.sp];
          break;
      }
      break;

    /**
     * 1nnn - JP addr
     * Jump to location nnn.
     *
     * The interpreter sets the program counter to nnn.
     */

    case 0x1000:
      this.pc = addr;
      break;

    /**
     * 2nnn - CALL addr
     * Call subroutine at nnn.
     *
     * The interpreter increments the stack pointer, then puts the current PC on
     * the top of the stack. The PC is then set to nnn.
     */

    case 0x2000:
      this.stack[this.sp] = this.pc;
      this.sp++;
      this.pc = addr;
      break;

    /**
     * 3xkk - SE Vx, byte
     * Skip next instruction if Vx = kk.
     *
     * The interpreter compares register Vx to kk, and if they are equal,
     * increments the program counter by 2.
     */
    case 0x3000:
      if (this.v[x] === byte) {
        this.pc += 2;
      }
      break;

    /**
     * 4xkk - SNE Vx, byte
     * Skip next instruction if Vx != kk.
     *
     * The interpreter compares register Vx to kk, and if they are not equal,
     * increments the program counter by 2.
     */

    case 0x4000:
      if (this.v[x] !== byte) {
        this.pc += 2;
      }
      break;

    /**
     * 5xy0 - SE Vx, Vy
     * Skip next instruction if Vx = Vy.
     *
     * The interpreter compares register Vx to register Vy, and if they are
     * equal, increments the program counter by 2.
     */

    case 0x5000:
      if (this.v[x] === this.v[y]) {
        this.pc += 2;
      }
      break;

    /*
     * 6xkk - LD Vx, byte
     * Set Vx = kk.
     *
     * The interpreter puts the value kk into register Vx.
     */

    case 0x6000:
      this.v[x] = byte;
      break;

    /**
     * 7xkk - ADD Vx, byte
     * Set Vx = Vx + kk.
     *
     * Adds the value kk to the value of register Vx, then stores the result in
     * Vx.
     */

    case 0x7000:
      this.v[x] += byte;
      if (this.v[x] > 0xFF) {
        this.v[x] -= 0x100;
      }
      break;

    case 0x8000:
      switch (opcode & 0xF) {

        /**
         * 8xy0 - LD Vx, Vy
         * Set Vx = Vy.
         *
         * Stores the value of register Vy in register Vx.
         */

        case 0:
          this.v[x] = this.v[y];
          break;

        /**
         * 8xy1 - OR Vx, Vy
         * Set Vx = Vx OR Vy.
         *
         * Performs a bitwise OR on the values of Vx and Vy, then stores the
         * result in Vx. A bitwise OR compares the corrseponding bits from two
         * values, and if either bit is 1, then the same bit in the result is
         * also 1. Otherwise, it is 0.
         */

        case 1:
          this.v[x] |= this.v[y];
          break;

        /**
         * 8xy2 - AND Vx, Vy
         * Set Vx = Vx AND Vy.
         *
         * Performs a bitwise AND on the values of Vx and Vy, then stores the
         * result in Vx. A bitwise AND compares the corrseponding bits from two
         * values, and if both bits are 1, then the same bit in the result is
         * also 1. Otherwise, it is 0.
         */

        case 2:
          this.v[x] &= this.v[y];
          break;

        /**
         * 8xy3 - XOR Vx, Vy
         * Set Vx = Vx XOR Vy.
         *
         * Performs a bitwise exclusive OR on the values of Vx and Vy, then
         * stores the result in Vx. An exclusive OR compares the corrseponding
         * bits from two values, and if the bits are not both the same,
         * then the corresponding bit in the result is set to 1. Otherwise, it
         * is 0.
         */

        case 3:
          this.v[x] ^= this.v[y];
          break;

        /**
         * 8xy4 - ADD Vx, Vy
         * Set Vx = Vx + Vy, set VF = carry.
         *
         * The values of Vx and Vy are added together. If the result is greater
         * than 8 bits (i.e., > 255,) VF is set to 1, otherwise 0. Only the
         * lowest 8 bits of the result are kept, and stored in Vx.
         */

        case 4:
          this.v[x] += this.v[y];
          this.v[0xF] = +(this.v[x] > 0xFF);
          if (this.v[x] > 0xFF) {
            this.v[x] -= 0x100;
          }
          break;

        /**
         * 8xy5 - SUB Vx, Vy
         * Set Vx = Vx - Vy, set VF = NOT borrow.
         *
         * If Vx > Vy, then VF is set to 1, otherwise 0. Then Vy is subtracted
         * from Vx, and the results stored in Vx.
         */

        case 5:
          this.v[0xF] = +(this.v[x] > this.v[y]);
          this.v[x] -= this.v[y];
          if (this.v[x] < 0) {
            this.v[x] += 0x100;
          }
          break;

        /**
         * 8xy6 - SHR Vx {, Vy}
         * Set Vx = Vx SHR 1.
         *
         * If the least-significant bit of Vx is 1, then VF is set to 1,
         * otherwise 0. Then Vx is divided by 2.
         */

        case 6:
          this.v[0xF] = +(this.v[x] & 1);
          this.v[x] >>= 1;
          break;

        /**
         * 8xy7 - SUBN Vx, Vy
         * Set Vx = Vy - Vx, set VF = NOT borrow.
         *
         * If Vy > Vx, then VF is set to 1, otherwise 0. Then Vx is subtracted
         * from Vy, and the results stored in Vx.
         */

        case 7:
          this.v[0xF] = +(this.v[y] > this.v[x]);
          this.v[x] = this.v[y] - this.v[x];
          if (this.v[x] < 0) {
            this.v[x] += 0x100;
          }
          break;

        /**
         * 8xyE - SHL Vx {, Vy}
         * Set Vx = Vx SHL 1.
         *
         * If the most-significant bit of Vx is 1, then VF is set to 1,
         * otherwise to 0. Then Vx is multiplied by 2.
         */

        case 0xE:
          this.v[0xF] = +(this.v[x] & 0x80);
          this.v[x] <<= 1;
          if (this.v[x] > 0xFF) {
            this.v[x] -= 0x100;
          }
          break;
      }
      break;

    /**
     * 9xy0 - SNE Vx, Vy
     * Skip next instruction if Vx != Vy.
     *
     * The values of Vx and Vy are compared, and if they are not equal, the
     * program counter is increased by 2.
     */

    case 0x9000:
      if (this.v[x] !== this.v[y]) {
        this.pc += 2;
      }
      break;

    /**
     * Annn - LD I, addr
     * Set I = nnn.
     *
     * The value of register I is set to nnn.
     */

    case 0xA000:
      this.i = addr;
      break;

    /**
     * Bnnn - JP V0, addr
     * Jump to location nnn + V0.
     *
     * The program counter is set to nnn plus the value of V0.
     */

    case 0xB000:
      this.pc = addr + this.v[0];
      break;

    /**
     * Cxkk - RND Vx, byte
     * Set Vx = random byte AND kk.
     *
     * The interpreter generates a random number from 0 to 255, which is then
     * ANDed with the value kk. The results are stored in Vx. See instruction
     * 8xy2 for more information on AND.
     */

    case 0xC000:
      this.v[x] = Math.floor(Math.random() * 0xFF) & byte;
      break;

    /**
     * Dxyn - DRW Vx, Vy, nibble
     * Display n-byte sprite starting at memory location I at (Vx, Vy),
     * set VF = collision.
     *
     * The interpreter reads n bytes from memory, starting at the address stored
     * in I. These bytes are then displayed as sprites on screen at
     * coordinates (Vx, Vy). Sprites are XORed onto the existing screen. If this
     * causes any pixels to be erased, VF is set to 1, otherwise it is set to 0.
     * If the sprite is positioned so part of it is outside the coordinates of
     * the display, it wraps around to the opposite side of the screen. See
     * instruction 8xy3 for more information on XOR, and section 2.4, Display,
     * for more information on the Chip-8 screen and sprites.
     */

    case 0xD000:
      this.v[0xF] = 0;

      var n = opcode & 0xF
        , vx = this.v[x]
        , vy = this.v[y];

      for (var cy = 0; cy < n; cy++) {
        var spr = this.memory[this.i + cy];
        for (var cx = 0; cx < 8; cx++) {
          if ((spr & 0x80) > 0) {
            if (this.setPixel(vx + cx, vy + cy)) {
              this.v[0xF] = 1;
            }
          }
          spr <<= 1;
        }
        this.requestRender = true;
      }
      break;

    case 0xE000:
      switch (opcode & 0xFF) {

        /**
         * Ex9E - SKP Vx
         * Skip next instruction if key with the value of Vx is pressed.
         *
         * Checks the keyboard, and if the key corresponding to the value of Vx
         * is currently in the down position, PC is increased by 2.
         */

        case 0x9E:
          // TODO(dmacosta) unimplemented.
          //
          // draft
          // if (this.keyboard.pressed === this.v[x]) {
          //   this.pc += 2;
          // }
          break;

        /**
         * ExA1 - SKNP Vx
         * Skip next instruction if key with the value of Vx is not pressed.
         *
         * Checks the keyboard, and if the key corresponding to the value of Vx
         * is currently in the up position, PC is increased by 2.
         */

        case 0xA1:
          // TODO(dmacosta) unimplemented.
          //
          // draft
          // if (this.keyboard.key !== this.v[x]) {
          //   this.pc += 2;
          // }
          break;
      }
      break;

    case 0xF000:
      switch (opcode & 0xFF) {

        /**
         * Fx07 - LD Vx, DT
         * Set Vx = delay timer value.
         *
         * The value of DT is placed into Vx.
         */

        case 7:
          this.v[x] = this.dt;
          break;

        /**
         * Fx0A - LD Vx, K
         * Wait for a key press, store the value of the key in Vx.
         *
         * All execution stops until a key is pressed, then the value of that
         * key is stored in Vx.
         */

        case 0x0A:
          // TODO(dmacosta) unimplemented.
          //
          // draft
          // this.keyboard.waitInput(function(key) {
          //   this.v[x] = key;
          // });
          break;

        /**
         * Fx15 - LD DT, Vx
         * Set delay timer = Vx.
         *
         * DT is set equal to the value of Vx.
         */

        case 0x15:
          this.dt = this.v[x];
          break;

        /**
         * Fx18 - LD ST, Vx
         * Set sound timer = Vx.
         *
         * ST is set equal to the value of Vx.
         */

        case 0x18:
          this.st = this.v[x];
          break;

        /**
         * Fx1E - ADD I, Vx
         * Set I = I + Vx.
         *
         * The values of I and Vx are added, and the results are stored in I.
         */

        case 0x1E:
          this.i += this.v[x];
          break;

        /**
         * Fx29 - LD F, Vx
         * Set I = location of sprite for digit Vx.
         *
         * The value of I is set to the location for the hexadecimal sprite
         * corresponding to the value of Vx. See section 2.4, Display, for more
         * information on the Chip-8 hexadecimal font.
         */

        case 0x29:
          this.i = this.v[x] * 5;
          break;

        /**
         * Fx33 - LD B, Vx
         * Store BCD representation of Vx in memory locations I, I+1, and I+2.
         *
         * The interpreter takes the decimal value of Vx, and places the
         * hundreds digit in memory at location in I, the tens digit at
         * location I+1, and the ones digit at location I+2.
         */

        case 0x33:
          var v = this.v[x];
          for (i = 3; i > 0; i--) {
            this.memory[this.i + i - 1] = parseInt(v % 10);
            v /= 10;
          }
          break;

        /**
         * Fx55 - LD [I], Vx
         * Store registers V0 through Vx in memory starting at location I.
         *
         * The interpreter copies the values of registers V0 through Vx into
         * memory, starting at the address in I.
         */

        case 0x55:
          for (i = 0; i <= x; i++) {
            this.memory[this.i + i] = this.v[i];
          }
          break;

        /**
         * Fx65 - LD Vx, [I]
         * Read registers V0 through Vx from memory starting at location I.
         *
         * The interpreter reads values from memory starting at location I into
         * registers V0 through Vx.
         */

        case 0x65:
          for (i = 0; i <= x; i++) {
            this.v[i] = this.memory[this.i + i];
          }
          break;
      }
      break;

    default:
      throw new Error('Unknown opcode ' + opcode.toString(16));
  }
};

/**
 * Sets a pixel in screen at (x, y) position.
 *
 * @param {Number} x position
 * @param {Number} y position
 */

Chip8.prototype.setPixel = function(x, y) {
  var w = this.displayWidth
    , h = this.displayHeight;

  // If the pixel exceeds the dimensions, wrap it back around.
  if (x > w) {
    x -= w;
  } else if (x < 0) {
    x += w;
  }

  if (y > h) {
    y -= h;
  } else if (y < 0) {
    y += h;
  }

  var location = x + (y * w);

  this.display[location] ^= 1;

  return !this.display[location];
};
