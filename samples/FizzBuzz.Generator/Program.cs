using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using DeGA.Core;
using DeGA.Assistant.OpenAI;
using DeGA.Generator.CSharp.LayerActions;
using DeGA.Core.Scopes.FileSystem;
using DeGA.Generator.CSharp;
using DeGA.Generator.CSharp.Generators;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

var openAiKey = builder.Configuration["OpenAIApiKey"]
        ?? throw new InvalidOperationException("No OpenAI API key has been set.");

services.AddDeGA("FizzBuzz.Output")
    .AddOpenAIAssistant(openAiKey)
    .AddCSharpGeneration();

var host = builder.Build();

var workspace = host.Services.GetRequiredService<GeneratorWorkspace>();
await workspace.InitializeAsync();

var projectGenerator = host.Services.GetRequiredService<DotNetProjectGenerator>();
var project = await projectGenerator.CreateAsync("FizzBuzz/FizzBuzz.csproj", "Console App");
var codeGeneratorFactory = host.Services.GetRequiredService<CodeGeneratorFactory>();
var appCodeGenerator = codeGeneratorFactory.Create(project);
await appCodeGenerator.CreateClassAsync("Program", "A main method that implements the common fizz buzz app.");


//generator
//    .InDirectory("/src/FizzBuzz/")
//    .Generate("Base Project", folder =>
//        folder.AddProjectFile("FizzBuzz", "Console App"));

//    generateFizzBuzz
//        .AddAction<GenerateProject, GenerateProjectOptions>(
//            new GenerateProjectOptions("FizzBuzz", "Console App"))
//        .AddAction<GenerateClass, GenerateClassOptions>(
//            new GenerateClassOptions("Program", "A main method that implements the common fizz buzz app.")))
//.StartScope(new DotNetSolutionScope("FizzBuzz.sln"))

//await generator.BuildAsync();

//var generator2 = new Generator();

//generator2
//    .Generate("Base Project",
//        generate =>
//        {
//            generate.InDirectory("/src/FizzBuzz")
//                .AddProjectFile("FizzBuzz", "Console App")
//                .AddClass("Program", "A main method that implements the common fizz buzz app.");
//        });


