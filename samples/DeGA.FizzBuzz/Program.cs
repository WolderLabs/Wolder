
using Azure.AI.OpenAI;
using DeGA.Core;
using DeGA.OpenAI;

var client = new OpenAIClient("your-api-key-from-platform.openai.com");
var assitant = new OpenAIAssistant()

var fileSystem = new WorkspaceFileSystem("DeGA.FizzBuzz.Workspace");
var workspace = new Workspace("DeGA.FizzBuzz.Workspace");
