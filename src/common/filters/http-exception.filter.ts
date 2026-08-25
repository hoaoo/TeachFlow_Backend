import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || obj.error || message;
        error = obj.error || error;
        if (typeof obj.code === 'string' && obj.code.trim()) {
          code = obj.code;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled Exception at ${request.method} ${request.url}`, exception.stack);
      message = process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : exception.message;
    }

    if (status >= 500) {
      this.logger.error(`[${status}] ${request.method} ${request.url}`, exception instanceof Error ? exception.stack : JSON.stringify(exception));
    } else {
      this.logger.warn(`[${status}] ${request.method} ${request.url}: ${JSON.stringify(message)}`);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      ...(code ? { code } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
