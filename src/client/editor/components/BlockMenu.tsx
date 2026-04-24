import React from "react";
import { findParentNode } from "prosemirror-utils";
import CommandMenu, { Props } from "./CommandMenu";
import BlockMenuItem from "./BlockMenuItem";
import getMenuItems from "../menus/block";

type BlockMenuProps = Omit<
  Props,
  "renderMenuItem" | "items" | "onClearSearch"
> &
  Required<Pick<Props, "onLinkToolbarOpen" | "embeds">>;

class BlockMenu extends React.Component<BlockMenuProps> {
  get items() {
    return getMenuItems(this.props.dictionary);
  }

  clearSearch = () => {
    const { state, dispatch } = this.props.view;
    const parent = findParentNode(node => !!node)(state.selection);

    if (parent) {
      // parent.pos is before the node boundary. Start at the first character
      // inside the current block to avoid pulling the selection into
      // the previous line.
      dispatch(state.tr.insertText("", parent.pos + 1, state.selection.to));
    }
  };

  render() {
    return (
      <CommandMenu
        {...this.props}
        filterable={true}
        onClearSearch={this.clearSearch}
        renderMenuItem={(item, _index, options) => {
          return (
            <BlockMenuItem
              onClick={options.onClick}
              selected={options.selected}
              icon={item.icon}
              title={item.title}
              shortcut={item.shortcut}
            />
          );
        }}
        items={this.items}
      />
    );
  }
}

export default BlockMenu;
