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

const IMAGE_INPUT_REGEX = /!\[(?<alt>[^\]]*?)\]\((?<filename>[^)]+?)\)/;

// Ensure the global flag is set
const extractImageTags = new RegExp(IMAGE_INPUT_REGEX.source, IMAGE_INPUT_REGEX.flags+"g");

const imageRawUrls: string[] = [];

// Loop through all matches
let matches;
while ((matches = extractImageTags.exec(markdown)) !== null) {
    if (matches.groups?.filename) {
        imageRawUrls.push(matches.groups.filename);
    }
}

const filteredUrls = imageRawUrls.filter((url) => url !== undefined);
console.log("imageRawUrls", filteredUrls);
      
      