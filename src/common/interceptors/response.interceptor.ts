import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => {
        // Si ya viene con formato final, no lo vuelvas a envolver
        if (data && typeof data === 'object' && 'success' in data) return data;

        return {
          success: true,
          message: 'OK',
          data,
          meta: {
            timestamp: new Date().toISOString(),
            path: req?.url,
            method: req?.method,
          },
        };
      }),
    );
  }
}
