import React, { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

export const markdownEditor = () => {
  const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
  };

  return (
    <TextareaAutosize
      title="Markdown Raw"
      className="markdownRaw"
      onChange={handleMarkdownChange}
      value={markdownText || ""}
    ></TextareaAutosize>
  );
};
