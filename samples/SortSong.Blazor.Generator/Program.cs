using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.Core.Pipeline;
using Wolder.CSharp;
using Wolder.CSharp.Actions;
using Wolder.CSharp.OpenAI;
using Wolder.CSharp.OpenAI.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddDeGA(builder.Configuration.GetSection("Wolder"))
    .AddCommandLineActions()
    .AddCSharpGeneration();

var host = builder.Build();

var pipelineBuilder = host.Services.GetRequiredService<GeneratorPipelineBuilder>();
var pipeline = pipelineBuilder.Build("TodoList.Blazor.Output");

var webProject = new DotNetProjectReference("TodoList.Web/TodoList.Web.csproj");

pipeline
    .AddStep(ctx => new CreateSdkGlobal(DotNetSdkVersion.Net8))
    .AddStep(ctx =>
        new RunCommand(
            $"dotnet new blazor -o {webProject.Name} --interactivity server --empty"))
    .AddStep(ctx =>
        new TransformClass(
            webProject,
            "TodoList.Web/Program.cs",
            """
            Use reflection to register any classes in the current assembly
            that have a name that ends in `Service`, register them as scoped services.
            Register the default interface if possible. For example if TestService implements
            ITestService it should be registered as `services.AddScoped<ITestService, TestService>()`
            Make sure the services are registered before the app container is built.
            """))
    .AddStep(ctx =>
        new GenerateClass(
            webProject,
            "TodoList.Web.Models.TodoItem",
            """
            A model that represents a todo item. It should have the following properties:
            Id (guid)
            Title
            Completed
            Notes
            """))
    .AddStep(ctx =>
        new GenerateClass(
            webProject,
            "TodoList.Web.Service.TodoService",
            """
            A service that provides CRUD actions for todo list items. Assume todo list items are of type 
            TodoList.Web.Models.TodoItem. The items should be stored in a dictionary. Getting all items should return a list.
            """));
    // .AddStep(ctx =>
    //     new RunCommand("dotnet run", webProject.RelativeRoot, Interactive: true));

await pipeline.RunAsync();

