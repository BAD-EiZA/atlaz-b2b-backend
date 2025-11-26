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
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal Server Error';
    let details: any;
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'string') message = r;
      else if (r && typeof r === 'object') {
        message = (r as any).message || message;
        details =
          (r as any).message && Array.isArray((r as any).message)
            ? (r as any).message
            : (r as any).details;
        code = (r as any).code || code;
      }
      if ((exception as any).name) code = (exception as any).name;
    } else if (exception?.message) {
      message = exception.message;
    }

    res.status(status).json({
      code,
      message,
      details,
      path: req?.url,
      method: req?.method,
      timestamp: new Date().toISOString(),
      status,
    });
  }
}
