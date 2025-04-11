declare module 'd3-cloud' {
  export interface CloudWord {
    text: string;
    size: number;
    [key: string]: any;
  }
  
  interface CloudLayout {
    size(): [number, number];
    size(size: [number, number]): CloudLayout;
    words(words: CloudWord[]): CloudLayout;
    padding(padding: number | ((d: CloudWord) => number)): CloudLayout;
    rotate(rotate: number | ((d: CloudWord, i: number) => number)): CloudLayout;
    fontSize(fontSize: number | ((d: CloudWord) => number)): CloudLayout;
    font(font: string | ((d: CloudWord) => string)): CloudLayout;
    fontStyle(fontStyle: string | ((d: CloudWord) => string)): CloudLayout;
    fontWeight(fontWeight: string | ((d: CloudWord) => string)): CloudLayout;
    text(text: (d: CloudWord) => string): CloudLayout;
    spiral(spiral: string | ((size: [number, number]) => (t: number) => [number, number])): CloudLayout;
    random(): number;
    random(random: () => number): CloudLayout;
    canvas(): HTMLCanvasElement;
    canvas(canvas: HTMLCanvasElement): CloudLayout;
    start(): CloudLayout;
    stop(): CloudLayout;
    timeInterval(interval: number): CloudLayout;
    on(type: string, callback: (words: CloudWord[]) => void): CloudLayout;
  }
  
  function cloud(): CloudLayout;
  export default cloud;
}