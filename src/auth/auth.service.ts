import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthDto } from './dto';
import * as bcrypt from 'bcrypt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // "testRegex": ".e2e-spec.ts$",

  async signup(dto: AuthDto) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(dto.password, salt);
    delete dto.password;
    try {
      const user = await this.prisma.user.create({
        data: {
          ...dto,
          hash,
        },
      });
      delete user.hash;
      return user;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        // duplicating unique field
        if (error.code === 'P2002') {
          throw new ForbiddenException('Credentials taking');
        }
      }

      throw error;
    }
  }

  async signin(dto: AuthDto) {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: {
          email: dto.email,
        },
      });

      const passwordMatches = await bcrypt.compare(dto.password, user.hash);

      if (!passwordMatches) {
        throw new NotFoundException('wrong password');
      }

      const access_token = await this.generateJWT(user.id, user.email);

      return {
        email: user.email,
        access_token,
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException('wrong credentials');
        }
      }

      throw error;
    }
  }

  async generateJWT(userId: number, email: string): Promise<string> {
    const payload = {
      sub: userId,
      email,
    };
    const secret = this.config.get('JWT_SECRET');
    const access_token = this.jwt.signAsync(payload, {
      expiresIn: '15m',
      secret,
    });
    return access_token;
  }
}
