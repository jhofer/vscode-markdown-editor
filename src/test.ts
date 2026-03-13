describe("image markdown extraction", () => {
    it("extracts image URLs", () => {
        const markdown = `
hehe simple view

- [ ] okey todo list
- [ ] asdf
- [ ] asdf

test

- [ ] ddd

* bullet
* 
* \

\
![img2](https://mayvers.com.au/wp-content/uploads/2017/09/test-image-600x338.jpg)

![localImage](1712931903272.png)
`;

        const imageInputRegex = /!\[(?<alt>[^\]]*?)\]\((?<filename>[^)]+?)\)/;
        const extractImageTags = new RegExp(
            imageInputRegex.source,
            `${imageInputRegex.flags}g`
        );

        const imageRawUrls: string[] = [];
        let matches: RegExpExecArray | null;
        while ((matches = extractImageTags.exec(markdown)) !== null) {
            if (matches.groups?.filename) {
                imageRawUrls.push(matches.groups.filename);
            }
        }

        const filteredUrls = imageRawUrls.filter((url) => url !== undefined);
        expect(filteredUrls).toHaveLength(2);
    });
});
      
      