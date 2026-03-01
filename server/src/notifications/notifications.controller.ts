import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for the current user' })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  async findAll(@Request() req: any, @Query('unreadOnly') unreadOnly?: string) {
    const userId = req.user?.id ?? req.query?.userId;
    const notifications = await this.notificationsService.findByUser(
      userId,
      unreadOnly === 'true'
    );
    return { notifications };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@Request() req: any) {
    const userId = req.user?.id ?? req.query?.userId;
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id ?? req.query?.userId;
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@Request() req: any) {
    const userId = req.user?.id ?? req.query?.userId;
    return this.notificationsService.markAllAsRead(userId);
  }
}
