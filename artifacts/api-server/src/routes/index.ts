import { Router, type IRouter } from "express";
import healthRouter from "./health";
import brokerRouter from "./broker";
import adminRouter from "./admin";
import leadsRouter from "./leads";
import trafficCollectRouter from "./traffic-collect";
import trafficReportRouter from "./traffic-report";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brokerRouter);
router.use(adminRouter);
router.use(leadsRouter);
router.use(trafficCollectRouter);
router.use(trafficReportRouter);

export default router;
