import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      const user = await this.usersService.create({
        ...registerDto,
        role: registerDto.role,
      });
      const { password, ...result } = user as any;
      
      const payload = { 
        sub: user.id, 
        email: user.email, 
        role: user.role,
        adminId: user.adminId,
        commission: user.commission,
      };
      const access_token = this.jwtService.sign(payload);

      return {
        user: result,
        access_token,
      };
    } catch (error) {
      if (error.code === '23505') {
        throw new BadRequestException('El email o teléfono ya está registrado');
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user || !(await bcrypt.compare(loginDto.password, user.password))) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      adminId: user.adminId,
      commission: user.commission,
    };
    const access_token = this.jwtService.sign(payload);

    const { password, ...result } = user as any;

    return {
      user: result,
      access_token,
    };
  }

  async validateUser(userId: number) {
    return this.usersService.findOne(userId);
  }
}

