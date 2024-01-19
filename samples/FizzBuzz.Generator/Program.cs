using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using DeGA.Core;
using DeGA.Assistant.OpenAI;
using DeGA.Generator.CSharp.LayerActions;
using DeGA.Generator.CSharp.Compilation;
using DeGA.Core.Scopes.FileSystem;
using DeGA.Generator.CSharp;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

builder.Services.AddDeGA("FizzBuzz.Output");
builder.Services.AddOpenAIAssistant(builder.Configuration["OpenAIApiKey"]
    ?? throw new InvalidOperationException("No OpenAI API key has been set."));

var host = builder.Build();

var generator = host.Services.GetRequiredService<GeneratorWorkspace>();

generator
    .InDirectory("/src/FizzBuzz/")
    .Generate("Base Project", folder =>
        folder.AddProjectFile("FizzBuzz", "Console App"));

generator
    .InDirectory("/src/FizzBuzz/")
    .Generate("");
    //    generateFizzBuzz
    //        .AddAction<GenerateProject, GenerateProjectOptions>(
    //            new GenerateProjectOptions("FizzBuzz", "Console App"))
    //        .AddAction<GenerateClass, GenerateClassOptions>(
    //            new GenerateClassOptions("Program", "A main method that implements the common fizz buzz app.")))
    //.StartScope(new DotNetSolutionScope("FizzBuzz.sln"))

await generator.BuildAsync();
