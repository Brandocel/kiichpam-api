import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const resBody = isHttp ? exception.getResponse() : null;

    let message = 'Internal server error';
    let errors: any[] = [];

    if (typeof resBody === 'string') {
      message = resBody;
    } else if (resBody && typeof resBody === 'object') {
      const m = (resBody as any).message;

      if (Array.isArray(m)) {
        message = 'Validation error';
        errors = m.map((msg) => ({ message: msg }));
      } else if (typeof m === 'string') {
        message = m;
      } else if ((resBody as any).error) {
        message = (resBody as any).error;
      }
    } else if (exception?.message) {
      message = exception.message;
    }

    response.status(status).json({
      success: false,
      message,
      errors,
      meta: {
        timestamp: new Date().toISOString(),
        path: request?.url,
        method: request?.method,
        statusCode: status,
      },
    });
  }
}
