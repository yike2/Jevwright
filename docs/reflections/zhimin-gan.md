# Reflection: Zhimin Gan

In Project 2, Yike and I built Jevwright, a web testing platform that uses the small Jev model to locate elements and judge assertions.

My main lesson is about coding with AI. AI writes code very fast and changes many files at once, so I could not read every line. I had to find other ways to check its work.

We wrote a technical design before any code. Each module had a technical design document with its architecture and the interfaces. This is where I spent most of my time. The AI will followed the design to code. Other partner could know the structure of my code and code with the public interface shown in the technical desgin document. We also drew architecture diagrams, which let us agree on the big picture in minutes.

We also relied on tests. We had unit, integration, and E2E tests, and CI ran all of them on every pull request, so if a change broke an old feature, CI failed and we saw it. We also used TDD. I committed failing tests first, and the AI's job was to make them pass. The AI knew it was done when the tests passed, so I did not need to keep asking it to fix things.

For code review, we used different levels of guards. An AI reviewer checked every change first and caught most obvious mistakes. Then I only reviewed the parts with the biggest impact, such as changes in doc, shared features, interfaces, security, and data. It could improve the efficiency of the development.

Another thing I know is the importance of the documents in AI coding. A design document shows what we planned, but when we write the real code, we think about many more cases, and sometimes we have to break the old design. If the document is not updated at the same time, the next AI session or my partner will build on the wrong design. So we updated the documents in the same pull request as the code.