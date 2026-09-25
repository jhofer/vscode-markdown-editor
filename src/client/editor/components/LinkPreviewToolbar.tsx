import * as React from "react";
import copy from "copy-to-clipboard";
import { EditorView } from "prosemirror-view";
import { CopyIcon, EditIcon, OpenIcon, TrashIcon } from "outline-icons";
import styled, { withTheme } from "styled-components";
import FloatingToolbar from "./FloatingToolbar";
import Flex from "./Flex";
import ToolbarButton from "./ToolbarButton";
import getMarkRange from "../queries/getMarkRange";
import { editLinkHint, followLinkHint } from "../marks/Link";
import baseDictionary from "../dictionary";
import theme from "../styles/theme";
import { ToastType } from "../types";

type Props = {
  /** Whether the preview may show at all (editor focused, no other link or
   *  search UI open). It is then shown whenever the cursor is inside a link. */
  isActive: boolean;
  view: EditorView;
  tooltip: typeof React.Component | React.FC<any>;
  dictionary: typeof baseDictionary;
  theme: typeof theme;
  onEdit: () => void;
  onClickLink: (href: string, event: MouseEvent) => void;
  onShowToast?: (message: string, code: string) => void;
};

/** Compact bar shown while the cursor sits inside a link: it shows where the
 *  link points and offers open / edit / copy / remove without taking focus
 *  away from the text. */
function LinkPreviewToolbar(props: Props) {
  const { view, dictionary, theme, onEdit, onClickLink, onShowToast } = props;
  const { state } = view;
  const { selection } = state;
  const range =
    props.isActive && selection.empty
      ? getMarkRange(selection.$from, state.schema.marks.link)
      : false;
  const href: string = range ? range.mark.attrs.href : "";
  const active = !!range && !!href;
  const Tooltip = props.tooltip;

  // Keep the editor focused (and the cursor where it is) when the bar is used.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault();

  const handleOpen = (event: React.MouseEvent) => {
    event.preventDefault();
    onClickLink(href, event.nativeEvent);
  };

  const handleCopy = () => {
    copy(href);
    onShowToast?.(dictionary.linkCopied, ToastType.Info);
  };

  const handleRemove = () => {
    if (!range) return;
    view.dispatch(state.tr.removeMark(range.from, range.to, range.mark));
    view.focus();
  };

  return (
    <FloatingToolbar view={view} active={active}>
      {active && (
        <Flex align="center" onMouseDown={keepFocus}>
          <Href
            href={href}
            title={`${href}\n${followLinkHint} to open`}
            onClick={handleOpen}
          >
            {href}
          </Href>
          <ToolbarButton onClick={handleOpen}>
            <Tooltip
              tooltip={`${dictionary.openLink} (${followLinkHint})`}
              placement="top"
            >
              <OpenIcon color={theme.toolbarItem} />
            </Tooltip>
          </ToolbarButton>
          <ToolbarButton onClick={onEdit}>
            <Tooltip
              tooltip={`${dictionary.editLink} (${editLinkHint})`}
              placement="top"
            >
              <EditIcon color={theme.toolbarItem} />
            </Tooltip>
          </ToolbarButton>
          <ToolbarButton onClick={handleCopy}>
            <Tooltip tooltip={dictionary.copyLink} placement="top">
              <CopyIcon color={theme.toolbarItem} />
            </Tooltip>
          </ToolbarButton>
          <ToolbarButton onClick={handleRemove}>
            <Tooltip tooltip={dictionary.removeLink} placement="top">
              <TrashIcon color={theme.toolbarItem} />
            </Tooltip>
          </ToolbarButton>
        </Flex>
      )}
    </FloatingToolbar>
  );
}

const Href = styled.a`
  display: inline-block;
  max-width: 280px;
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 24px;
  font-family: ${(props) => props.theme.fontFamily};
  font-size: 14px;
  color: ${(props) => props.theme.toolbarItem};
  text-decoration: underline;
  cursor: pointer;
  pointer-events: all;
`;

export default withTheme(LinkPreviewToolbar);
