import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ingestionsRouter from "./ingestions";
import recordsRouter from "./records";
import dashboardRouter from "./dashboard";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ingestionsRouter);
router.use(recordsRouter);
router.use(dashboardRouter);
router.use(auditRouter);

export default router;
