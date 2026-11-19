"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useWeddingScope } from "./wedding-scope";

export function WorkspaceLink(props: ComponentProps<typeof Link>) {
  const scope = useWeddingScope();
  if (scope?.readOnlyPreview) {
    return (
      <a
        className={props.className}
        aria-current={props["aria-current"]}
        aria-label={props["aria-label"]}
      >
        {props.children}
      </a>
    );
  }
  return <Link {...props} />;
}
