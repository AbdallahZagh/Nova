import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDeviceTokenDto } from './dto/save-device-token.dto';

const INVALID_FCM_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseReady = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  async saveDeviceToken(userId: string, dto: SaveDeviceTokenDto) {
    const token = dto.token.trim();

    const deviceToken = await (this.prisma as any).userDeviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform: dto.platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token,
        platform: dto.platform,
      },
    });

    return {
      message: 'Device token saved successfully',
      data: deviceToken,
    };
  }

  async listNotifications(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [notifications, unreadCount, total] = await Promise.all([
      (this.prisma as any).notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      (this.prisma as any).notification.count({
        where: { userId, isRead: false },
      }),
      (this.prisma as any).notification.count({
        where: { userId },
      }),
    ]);

    return {
      unreadCount,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
      data: notifications,
    };
  }

  async markNotificationsRead(userId: string, notificationId?: string) {
    if (notificationId) {
      const notification = await (this.prisma as any).notification.updateMany({
        where: { id: notificationId, userId },
        data: { isRead: true },
      });

      return {
        message:
          notification.count > 0
            ? 'Notification marked as read'
            : 'Notification not found',
        count: notification.count,
      };
    }

    const result = await (this.prisma as any).notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return {
      message: 'Notifications marked as read',
      count: result.count,
    };
  }

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    metadata?: any,
  ) {
    const notification = await (this.prisma as any).notification.create({
      data: {
        userId,
        type,
        title,
        message: body,
        metadata,
      },
    });

    try {
      await this.pushToUserDevices(userId, title, body, {
        ...(metadata ?? {}),
        type,
        notificationId: notification.id,
      });
    } catch (error) {
      this.logger.error(
        `FCM push failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return notification;
  }

  async notifyUsers(
    userIds: string[],
    type: string,
    title: string,
    body: string,
    metadata?: any,
  ) {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

    await Promise.all(
      uniqueUserIds.map((userId) =>
        this.createNotification(userId, type, title, body, metadata),
      ),
    );
  }

  async notifyProjectMemberAdded(
    userId: string,
    projectId: string,
    projectName: string,
    inviterName: string,
  ) {
    await this.createNotification(
      userId,
      'PROJECT_MEMBER_ADDED',
      'Added to project',
      `${inviterName} added you to ${projectName}.`,
      { projectId },
    );
  }

  async notifyProjectMemberAddedToTeam(
    projectId: string,
    projectName: string,
    memberName: string,
    role: string,
    excludeUserIds: string[] = [],
  ) {
    await this.notifyProjectMembers(
      projectId,
      'PROJECT_TEAM_MEMBER_ADDED',
      'New project member',
      `${memberName} joined ${projectName} as ${role.toLowerCase()}.`,
      { projectId, memberName, role },
      excludeUserIds,
    );
  }

  async notifyProjectMemberRemoved(
    userId: string,
    projectId: string,
    projectName: string,
  ) {
    await this.createNotification(
      userId,
      'PROJECT_MEMBER_REMOVED',
      'Removed from project',
      `You were removed from ${projectName}.`,
      { projectId },
    );
  }

  async notifyWhiteboardMemberAdded(
    userId: string,
    whiteboardId: string,
    whiteboardTitle: string,
    inviterName: string,
    role: string,
    projectId?: string | null,
  ) {
    await this.createNotification(
      userId,
      'WHITEBOARD_MEMBER_ADDED',
      'Added to whiteboard',
      `${inviterName} added you to ${whiteboardTitle} as ${role.toLowerCase()}.`,
      {
        whiteboardId,
        role,
        url: `/whiteboard/${whiteboardId}`,
        ...(projectId ? { projectId } : {}),
      },
    );
  }

  async notifyWhiteboardRoleChanged(
    userId: string,
    whiteboardId: string,
    whiteboardTitle: string,
    role: string,
  ) {
    await this.createNotification(
      userId,
      'WHITEBOARD_ROLE_CHANGED',
      'Whiteboard role updated',
      `Your role on ${whiteboardTitle} is now ${role.toLowerCase()}.`,
      { whiteboardId, role, url: `/whiteboard/${whiteboardId}` },
    );
  }

  async notifyWhiteboardMemberRemoved(
    userId: string,
    whiteboardId: string,
    whiteboardTitle: string,
  ) {
    await this.createNotification(
      userId,
      'WHITEBOARD_MEMBER_REMOVED',
      'Removed from whiteboard',
      `You were removed from ${whiteboardTitle}.`,
      { whiteboardId, url: '/whiteboard' },
    );
  }

  async notifyWhiteboardCommentMention(
    userIds: string[],
    actorName: string,
    whiteboardTitle: string,
    whiteboardId: string,
    projectId?: string | null,
  ) {
    await this.notifyUsers(
      userIds,
      'WHITEBOARD_COMMENT_MENTION',
      'You were mentioned',
      `${actorName} mentioned you on ${whiteboardTitle}.`,
      {
        whiteboardId,
        url: `/whiteboard/${whiteboardId}`,
        ...(projectId ? { projectId } : {}),
      },
    );
  }

  async notifyTaskCommentMention(
    userIds: string[],
    actorName: string,
    taskTitle: string,
    taskId: string,
    projectId: string,
    commentId: string,
  ) {
    await this.notifyUsers(
      userIds,
      'TASK_COMMENT_MENTION',
      'You were mentioned',
      `${actorName} mentioned you in a comment on ${taskTitle}.`,
      {
        taskId,
        commentId,
        projectId,
        url: `/projects/${projectId}?task=${taskId}`,
      },
    );
  }

  async notifySuggestionMention(
    userIds: string[],
    actorName: string,
    projectName: string,
    projectId: string,
    suggestionId: string,
  ) {
    await this.notifyUsers(
      userIds,
      'PROJECT_SUGGESTION_MENTION',
      'You were mentioned',
      `${actorName} mentioned you in a suggestion on ${projectName}.`,
      {
        projectId,
        suggestionId,
        url: `/projects/${projectId}`,
      },
    );
  }

  async notifyWhiteboardDeleted(
    userIds: string[],
    whiteboardId: string,
    whiteboardTitle: string,
    projectId?: string | null,
  ) {
    await this.notifyUsers(
      userIds,
      'WHITEBOARD_DELETED',
      'Whiteboard deleted',
      `${whiteboardTitle} was deleted.`,
      {
        whiteboardId,
        url: '/whiteboard',
        ...(projectId ? { projectId } : {}),
      },
    );
  }

  async notifyProjectManagers(
    projectId: string,
    type: string,
    title: string,
    body: string,
    metadata?: any,
  ) {
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: {
          where: { role: 'ADMIN' },
          select: { userId: true },
        },
      },
    });

    if (!project) return;

    await this.notifyUsers(
      [project.ownerId, ...project.members.map((member: any) => member.userId)],
      type,
      title,
      body,
      { ...metadata, projectId },
    );
  }

  async notifyProjectMembers(
    projectId: string,
    type: string,
    title: string,
    body: string,
    metadata?: any,
    excludeUserIds: string[] = [],
  ) {
    const project = await (this.prisma as any).project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: { select: { userId: true } },
      },
    });

    if (!project) return;

    const excluded = new Set(excludeUserIds);
    const userIds = [
      project.ownerId,
      ...project.members.map((member: any) => member.userId),
    ].filter((userId) => !excluded.has(userId));

    await this.notifyUsers(
      userIds,
      type,
      title,
      body,
      { ...metadata, projectId },
    );
  }

  async notifyTaskAssigned(userId: string, taskId: string, taskTitle: string) {
    await this.createNotification(
      userId,
      'TASK_ASSIGNED',
      'Task assigned',
      `You were assigned to ${taskTitle}.`,
      { taskId },
    );
  }

  async notifyTaskUnassigned(userId: string, taskId: string, taskTitle: string) {
    await this.createNotification(
      userId,
      'TASK_UNASSIGNED',
      'Task assignment removed',
      `You were unassigned from ${taskTitle}.`,
      { taskId },
    );
  }

  async notifyTaskUpdated(taskId: string, taskTitle: string) {
    const userIds = await this.getTaskRecipientIds(taskId);
    await this.notifyUsers(
      userIds,
      'TASK_UPDATED',
      'Task updated',
      `${taskTitle} was updated.`,
      { taskId },
    );
  }

  async notifyTaskDone(taskId: string, taskTitle: string) {
    const task = await (this.prisma as any).task.findUnique({
      where: { id: taskId },
      select: {
        project: { select: { ownerId: true } },
      },
    });

    const userIds = await this.getTaskRecipientIds(taskId);
    if (task?.project?.ownerId) userIds.push(task.project.ownerId);

    await this.notifyUsers(
      userIds,
      'TASK_DONE',
      'Task completed',
      `${taskTitle} is done.`,
      { taskId },
    );
  }

  async notifySubtaskAssigned(
    userId: string,
    subtaskId: string,
    subtaskTitle: string,
  ) {
    await this.createNotification(
      userId,
      'SUBTASK_ASSIGNED',
      'Subtask assigned',
      `You were assigned to ${subtaskTitle}.`,
      { subtaskId },
    );
  }

  async notifySubtaskUnassigned(
    userId: string,
    subtaskId: string,
    subtaskTitle: string,
  ) {
    await this.createNotification(
      userId,
      'SUBTASK_UNASSIGNED',
      'Subtask assignment removed',
      `You were unassigned from ${subtaskTitle}.`,
      { subtaskId },
    );
  }

  async notifySubtaskUpdated(subtaskId: string, subtaskTitle: string) {
    const userIds = await this.getSubtaskRecipientIds(subtaskId);
    await this.notifyUsers(
      userIds,
      'SUBTASK_UPDATED',
      'Subtask updated',
      `${subtaskTitle} was updated.`,
      { subtaskId },
    );
  }

  async notifySubtaskDone(subtaskId: string, subtaskTitle: string) {
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      select: {
        task: { select: { project: { select: { ownerId: true } } } },
      },
    });

    if (!subtask?.task?.project?.ownerId) return;

    await this.createNotification(
      subtask.task.project.ownerId,
      'SUBTASK_DONE',
      'Subtask completed',
      `${subtaskTitle} is done.`,
      { subtaskId },
    );
  }

  async notifyTaskCommentReply(
    userId: string,
    commentId: string,
    taskTitle: string,
  ) {
    await this.createNotification(
      userId,
      'TASK_COMMENT_REPLY',
      'Comment replied',
      `An admin replied to your comment on ${taskTitle}.`,
      { commentId },
    );
  }

  async notifyTaskCommentStatusChanged(
    userId: string,
    commentId: string,
    taskTitle: string,
    status: string,
  ) {
    await this.createNotification(
      userId,
      'TASK_COMMENT_STATUS_CHANGED',
      'Comment status updated',
      `Your comment on ${taskTitle} was changed to ${status}.`,
      { commentId, status },
    );
  }

  @Cron('0 6 * * *')
  async sendDueDateReminders() {
    const today = this.startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const afterTomorrow = new Date(today);
    afterTomorrow.setDate(afterTomorrow.getDate() + 2);

    const tasks = await (this.prisma as any).task.findMany({
      where: {
        status: { not: 'Completed' },
        dueDate: { gte: today, lt: afterTomorrow },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assigneeId: true,
        assignments: { select: { userId: true } },
      },
    });

    const subtasks = await (this.prisma as any).subtask.findMany({
      where: {
        isCompleted: false,
        dueDate: { gte: today, lt: afterTomorrow },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assignments: { select: { userId: true } },
        task: { select: { id: true, title: true } },
      },
    });

    for (const task of tasks) {
      const userIds = [
        task.assigneeId,
        ...task.assignments.map((assignment: any) => assignment.userId),
      ].filter(Boolean);
      const dueLabel =
        task.dueDate >= tomorrow ? 'tomorrow' : 'today';

      await this.notifyUsers(
        userIds,
        'TASK_DUE_REMINDER',
        'Task due soon',
        `${task.title} is due ${dueLabel}.`,
        { taskId: task.id, dueDate: task.dueDate },
      );
    }

    for (const subtask of subtasks) {
      const userIds = subtask.assignments
        .map((assignment: any) => assignment.userId)
        .filter(Boolean);
      const dueLabel =
        subtask.dueDate && subtask.dueDate >= tomorrow ? 'tomorrow' : 'today';

      await this.notifyUsers(
        userIds,
        'SUBTASK_DUE_REMINDER',
        'Subtask due soon',
        `${subtask.title} is due ${dueLabel}.`,
        {
          subtaskId: subtask.id,
          taskId: subtask.task.id,
          dueDate: subtask.dueDate,
        },
      );
    }
  }

  private initializeFirebase() {
    if (getApps().length) {
      this.firebaseReady = true;
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID ?? 'nova-taskflow';
    const clientEmail =
      process.env.FIREBASE_CLIENT_EMAIL ??
      'firebase-adminsdk-fbsvc@nova-taskflow.iam.gserviceaccount.com';
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!privateKey) {
      this.logger.warn(
        'FIREBASE_PRIVATE_KEY is missing. Database notifications will work, but FCM push is disabled.',
      );
      return;
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    this.firebaseReady = true;
  }

  private async pushToUserDevices(
    userId: string,
    title: string,
    body: string,
    metadata?: any,
  ) {
    if (!this.firebaseReady) return;

    const deviceTokens = await (this.prisma as any).userDeviceToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });
    const tokens = deviceTokens.map((deviceToken: any) => deviceToken.token);

    if (!tokens.length) return;

    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: this.stringifyMetadata(metadata),
    });

    const invalidTokens = response.responses
      .map((sendResponse, index) =>
        !sendResponse.success &&
        sendResponse.error?.code &&
        INVALID_FCM_TOKEN_CODES.has(sendResponse.error.code)
          ? tokens[index]
          : null,
      )
      .filter(Boolean);

    if (invalidTokens.length) {
      await (this.prisma as any).userDeviceToken.updateMany({
        where: { token: { in: invalidTokens } },
        data: { isActive: false },
      });
    }
  }

  private async getTaskRecipientIds(taskId: string) {
    const task = await (this.prisma as any).task.findUnique({
      where: { id: taskId },
      select: {
        assigneeId: true,
        assignments: { select: { userId: true } },
      },
    });

    if (!task) return [];

    return [
      task.assigneeId,
      ...task.assignments.map((assignment: any) => assignment.userId),
    ].filter(Boolean);
  }

  private async getSubtaskRecipientIds(subtaskId: string) {
    const subtask = await (this.prisma as any).subtask.findUnique({
      where: { id: subtaskId },
      select: {
        assignments: { select: { userId: true } },
      },
    });

    if (!subtask) return [];

    return subtask.assignments
      .map((assignment: any) => assignment.userId)
      .filter(Boolean);
  }

  private stringifyMetadata(metadata?: any) {
    if (!metadata) return {};

    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value),
      ]),
    );
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}
