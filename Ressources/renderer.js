// Renderer concept used by lambda-diagrams
//
// Each drawTerm(term) returns:
// {
//   diagram: drawingObject,
//   height: number,
//   width: number
// }
//
// Term shapes:
// { type: "lam", body: term }
// { type: "var", index: number }        // de Bruijn index
// { type: "app", left: term, right: term }

const UNIT_WIDTH = 2;
const LEVEL_HEIGHT = 1;

function drawTerm(term) {
  if (term.type === "lam") {
    const child = drawTerm(term.body);

    // Draw a horizontal binder line above the body.
    const binderLength = UNIT_WIDTH * child.width - 0.5;

    const binder = horizontalLine({
      x: -0.75,
      y: 0,
      length: binderLength
    });

    const body = translate(child.diagram, {
      x: 0,
      y: -LEVEL_HEIGHT
    });

    return {
      diagram: overlay(binder, body),
      height: child.height + 1,
      width: child.width
    };
  }

  if (term.type === "var") {
    // Variable is drawn as a vertical wire.
    // Higher de Bruijn index = taller wire.
    const wireHeight = term.index + 1;

    const invisibleSpacing = phantomHorizontalSpace(UNIT_WIDTH);

    const wire = verticalLine({
      x: 0,
      y: 0,
      length: wireHeight,
      align: "bottom"
    });

    return {
      diagram: alignBottom(overlay(invisibleSpacing, wire)),
      height: 0,
      width: 1
    };
  }

  if (term.type === "app") {
    const left = drawTerm(term.left);
    const right = drawTerm(term.right);

    const deltaLeft = Math.max(0, right.height - left.height);
    const deltaRight = Math.max(0, left.height - right.height);

    // Extend the left side downward to reach the application bar.
    const leftTail = translate(
      verticalLine({
        length: deltaLeft + 1,
        align: "top"
      }),
      {
        x: 0,
        y: -left.height
      }
    );

    // Extend the right side downward only if needed.
    const rightTail = translate(
      verticalLine({
        length: deltaRight,
        align: "top"
      }),
      {
        x: 0,
        y: -right.height
      }
    );

    const leftDiagram = overlay(left.diagram, leftTail);
    const rightDiagram = overlay(right.diagram, rightTail);

    // Put function and argument next to each other.
    const combined = beside(leftDiagram, rightDiagram);

    // Draw the horizontal application bar under the left term.
    const bar = translate(
      horizontalLine({
        length: UNIT_WIDTH * left.width,
        align: "left",
        lineCap: "square"
      }),
      {
        x: 0,
        y: -left.height - deltaLeft
      }
    );

    return {
      diagram: overlay(combined, bar),
      height: left.height + deltaLeft + 1,
      width: left.width + right.width
    };
  }

  throw new Error("Unknown term type: " + term.type);
}
