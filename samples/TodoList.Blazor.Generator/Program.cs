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
var project = await projectGenerator.CreateBlazorServerAppAsync("TodoListBlazor");

var codeGeneratorFactory = host.Services.GetRequiredService<CodeGeneratorFactory>();
var appCodeGenerator = codeGeneratorFactory.Create(project);
await appCodeGenerator.TransformAsync("TodoListBlazor/Program.cs",
    """
    Use reflection to register any classes in the current assembly 
    that have a name that ends in `Service`, register them as scoped services.
    Make sure the services are registered before the app containter is built.
    """);

await appCodeGenerator.CreateClassesAsync(
    "TodoListBlazor",
    """
    A razor page with route '/todo' that shows a listing of todo items and the supporting 
    service that holds the todo items in memory.
    """);

