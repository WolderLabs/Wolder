using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

using DeGA.Core;
using DeGA.Assistant.OpenAI;
using DeGA.Generator.CSharp;
using DeGA.Generator.CSharp.Generators;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

var openAiKey = builder.Configuration["OpenAIApiKey"]
        ?? throw new InvalidOperationException("No OpenAI API key has been set.");

services.AddDeGA("TodoList.Blazor.Output")
    .AddOpenAIAssistant(openAiKey)
    .AddCSharpGeneration();

var host = builder.Build();

var workspace = host.Services.GetRequiredService<GeneratorWorkspace>();
await workspace.InitializeAsync();

var projectGenerator = host.Services.GetRequiredService<DotNetProjectGenerator>();
var project = await projectGenerator.CreateAsync(
    "TodoList.Blazor/TodoList.Blazor.csproj", "Blazor Server Web App that references the packages needed for basic DI.");

var codeGeneratorFactory = host.Services.GetRequiredService<CodeGeneratorFactory>();
var appCodeGenerator = codeGeneratorFactory.Create(project);
await appCodeGenerator.CreateClassAsync(
    className: "Program",
    behaviorPrompt: """
        "A `Main` method that initializes a blazor server project
        and uses reflection to register any classes in the current assembly 
        that have a name that ends in `Service`, register them as scoped services.
        """);
await appCodeGenerator.CreateClassesAsync(
    "TodoList.Blazor", "A razor page with route '/' that shows a listing of todo items and the supporting service that holds the todo items in memory.");

