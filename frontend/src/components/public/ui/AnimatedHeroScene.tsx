"use client";

import { motion } from "framer-motion";
import { SofaIcon, TvIcon, BedIcon, FridgeIcon, WashingMachineIcon } from "./SvgIcons";

export default function AnimatedHeroScene() {
  return (
    <div className="relative h-full min-h-[300px] w-full lg:min-h-[400px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary"
        style={{ width: "160px", height: "160px" }}
      >
        <SofaIcon className="h-full w-full opacity-80" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -50, y: 30 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="absolute left-[10%] top-[40%] text-accent"
        style={{ width: "100px", height: "100px" }}
      >
        <TvIcon className="h-full w-full opacity-90" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 50, y: -30 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="absolute right-[10%] top-[20%] text-success"
        style={{ width: "120px", height: "120px" }}
      >
        <FridgeIcon className="h-full w-full opacity-70" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.7 }}
        className="absolute bottom-[10%] right-[20%] text-primary"
        style={{ width: "90px", height: "90px" }}
      >
        <WashingMachineIcon className="h-full w-full opacity-60" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.6 }}
        className="absolute bottom-[15%] left-[20%] text-muted-foreground"
        style={{ width: "110px", height: "110px" }}
      >
        <BedIcon className="h-full w-full opacity-40" />
      </motion.div>
    </div>
  );
}
