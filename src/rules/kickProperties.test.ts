import { describe, expect, it } from "vitest";
import rawProperties from "../../jstris180.properties?raw";
import { JSTRIS180_PROPERTIES } from "./jstris180Properties";
import { parseKickProperties } from "./kickProperties";

describe("jstris180.properties parser", () => {
  it("Node 호환 런타임 사본이 루트 원본과 일치한다", () => {
    expect(JSTRIS180_PROPERTIES.replace(/\r\n/g, "\n")).toBe(rawProperties.replace(/\r\n/g, "\n"));
  });

  it("참조와 privilege 표식을 보존한다", () => {
    const table = parseKickProperties(rawProperties);
    expect(table["J.NE"]).toEqual(table["L.NE"]);
    expect(table["T.NE"][4]).toEqual({ dx: -1, dy: -2, privilege: true });
    expect(table["I.NS"]).toEqual([
      { dx: 1, dy: -1, privilege: false },
      { dx: 1, dy: 0, privilege: false },
    ]);
  });
});
