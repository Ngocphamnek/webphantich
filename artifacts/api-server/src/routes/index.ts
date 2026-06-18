import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crawlsRouter from "./crawls";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/crawls", crawlsRouter);

export default router;
