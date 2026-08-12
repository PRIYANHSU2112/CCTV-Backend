import bcrypt from 'bcrypt';

export class HashService {
  constructor(saltRounds = 10) {
    this.saltRounds = saltRounds;
  }

  async hashPassword(plainPassword) {
    const salt = await bcrypt.genSalt(this.saltRounds);
    return bcrypt.hash(plainPassword, salt);
  }

  async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
