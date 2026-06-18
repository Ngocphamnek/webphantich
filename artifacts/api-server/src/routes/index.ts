import { Router, type IRouter } from "express";
import healthRouter from "./health";
import crawlsRouter from "./crawls";
import proxyRouter from "./proxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/crawls", crawlsRouter);
router.use(proxyRouter);

export default router;
