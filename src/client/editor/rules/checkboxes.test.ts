import { parser } from "../server";

test("keeps plain items that follow a checkbox item in the same list", () => {
  const doc = parser.parse("- [ ] Approved\n\n- First\n- Second\n");
  expect(doc.childCount).toBe(2);
  expect(doc.child(0).type.name).toBe("checkbox_list");
  expect(doc.child(1).type.name).toBe("bullet_list");
  expect(doc.child(1).textContent).toBe("FirstSecond");
});

test("splits a tight mixed list into runs of the same kind", () => {
  const doc = parser.parse("- a\n- [x] b\n- c\n");
  const lists: string[] = [];
  doc.forEach(node => lists.push(node.type.name));
  expect(lists).toEqual(["bullet_list", "checkbox_list", "bullet_list"]);
  expect(doc.child(1).child(0).attrs.checked).toBe(true);
});
