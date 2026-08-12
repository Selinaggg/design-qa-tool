'use client';

/**
 * 高度 spring 折叠组件
 *
 * 用于 Issue 卡片展开、AI 配置面板、忽略规则分组等所有「折叠展开」场景。
 * 用 spring 缓动（damping 1.0 / response 0.3），可中断，从当前呈现值起步。
 *
 * 用法：
 *   <Collapse open={expanded}>
 *     <div>...</div>
 *   </Collapse>
 */

import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

interface CollapseProps {
  open: boolean;
  children: ReactNode;
  /** 首次 mount 时是否也播放展开动画（默认 false，避免页面进入时噼啪响） */
  initial?: boolean;
}

export function Collapse({ open, children, initial = false }: CollapseProps) {
  return (
    <AnimatePresence initial={initial}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: { type: 'spring', bounce: 0, duration: 0.3 },
            opacity: { duration: 0.2 },
          }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
