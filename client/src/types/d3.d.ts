declare module 'd3' {
  export function select(selector: string | Element): any;
  export function selectAll(selector: string): any;
  
  export interface Transition {
    duration(ms: number): Transition;
    delay(ms: number): Transition;
    ease(ease: any): Transition;
    style(name: string, value: any): Transition;
    attr(name: string, value: any): Transition;
    text(value: any): Transition;
    on(type: string, listener: (d: any, i: number) => void): Transition;
  }
  
  export interface Selection {
    append(name: string): Selection;
    attr(name: string, value: any): Selection;
    style(name: string, value: any): Selection;
    text(value: any): Selection;
    html(value: string): Selection;
    data(values: any[]): Selection;
    datum(value: any): Selection;
    enter(): Selection;
    exit(): Selection;
    remove(): Selection;
    classed(name: string, value: boolean): Selection;
    select(selector: string): Selection;
    selectAll(selector: string): Selection;
    filter(filter: any): Selection;
    on(type: string, listener: (d: any, i: number) => void): Selection;
    transition(name?: string): Transition;
    call(func: (...args: any[]) => any, ...args: any[]): Selection;
    each(func: (d: any, i: number, nodes: Element[]) => void): Selection;
    node(): Element;
    nodes(): Element[];
    size(): number;
  }
}