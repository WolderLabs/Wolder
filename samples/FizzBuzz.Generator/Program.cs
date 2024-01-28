using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using DeGA.Core;
using DeGA.Assistant.OpenAI;
using DeGA.Generator.CSharp;
using DeGA.Generator.CSharp.Generators;
using DeGA.Core.New;
using DeGA.CSharp.Actions;
using DeGA.CSharp.Compilation;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

var openAiKey = builder.Configuration["OpenAIApiKey"]
        ?? throw new InvalidOperationException("No OpenAI API key has been set.");

services.AddDeGA()
    .AddOpenAIAssistant(openAiKey)
    .AddCSharpGeneration();

var host = builder.Build();

var workspace = host.Services.GetRequiredService<GeneratorWorkspace>();
await workspace.InitializeAsync();

var projectGenerator = host.Services.GetRequiredService<DotNetProjectGenerator>();
var project = await projectGenerator.CreateAsync("FizzBuzz/FizzBuzz.csproj", "Console App");
var codeGeneratorFactory = host.Services.GetRequiredService<CodeGeneratorFactory>();
var appCodeGenerator = codeGeneratorFactory.Create(project);
await appCodeGenerator.CreateClassAsync(
    "Program", "A main method that implements the common fizz buzz app.");

var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj");

var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();
var pipeline = pipelineBuilder.Build("FizzBuzz.Output");
pipeline
    .AddStep(ctx => 
        new CreateProject(mainProject, ""))
    .AddStep(ctx => 
        new CreateClass(mainProject, "Program", "Console.WriteLine()"));
