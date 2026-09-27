import express from "express";
import {
  GetNotifications,
  MarkNotificationRead,
  ExportNotifications,
} from "../controllers/notificationControllers";

export const notificationRouter = express.Router();

notificationRouter.get("/", GetNotifications);
// #752 - full notification history export (CSV or JSON attachment).
notificationRouter.get("/export", ExportNotifications);
notificationRouter.patch("/:id/read", MarkNotificationRead);
