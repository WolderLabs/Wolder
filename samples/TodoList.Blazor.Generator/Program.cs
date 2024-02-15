using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core;
using Wolder.CSharp;
using Wolder.CSharp.Actions;
using Wolder.CSharp.OpenAI;
using Wolder.CSharp.OpenAI.Actions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.Core.Workspace;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddWolder(builder.Configuration.GetSection("Wolder"));

var host = builder.Build();

await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
    .AddCommandLineActions()
    .AddCSharpGeneration()
    .InvokeAsync<GenerateTodoListApp>("TodoList.Blazor.Output");

class GenerateTodoListApp(
    CommandLineActions commandLine,
    CSharpActions csharp,
    CSharpGenerator csharpGenerator) : IVoidAction
{
    public async Task InvokeAsync()
    {
        await csharp.CreateSdkGlobalAsync(
            new CreateSdkGlobalParameters(DotNetSdkVersion.Net8));
        
        var webProject = new DotNetProjectReference("TodoList.Web/TodoList.Web.csproj");
        
        await commandLine.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                $"dotnet new blazor -o {webProject.Name} --interactivity server --empty"));

        await csharpGenerator.TransformClassAsync(
            new TransformClassParameters(
                webProject,
                "TodoList.Web/Program.cs",
                """
                Use reflection to register any classes in the current assembly
                that have a name that ends in `Service`, register them as scoped services.
                Register the default interface if possible. For example if TestService implements
                ITestService it should be registered as `services.AddScoped<ITestService, TestService>()`
                Make sure the services are registered before the app container is built.
                """));

        var todoItem = await csharpGenerator.GenerateClassAsync(
            new GenerateClassParameters(
                webProject,
                "TodoList.Web.Models.TodoItem",
                """
                A model that represents a todo item. It should have the following properties:
                Id (guid)
                Title
                Completed
                Notes
                """));
        
        var todoServiceInterface = await csharpGenerator.GenerateClassAsync(
            new GenerateClassParameters(
                webProject,
                "TodoList.Web.Service.ITodoService",
                """
                An interface for a service that provides CRUD actions for todo list items.
                Assume todo list items are of type TodoList.Web.Models.TodoItem.
                """)
            {
                ContextMemoryItems = [todoItem]
            });
        
        var todoService = await csharpGenerator.GenerateClassAsync(
            new GenerateClassParameters(
                webProject,
                "TodoList.Web.Service.TodoService",
                """
                A service that implements ITodoService and provides CRUD actions for todo list items. Assume todo list items are of type 
                TodoList.Web.Models.TodoItem. The items should be stored in a dictionary. Getting all items should return a list.
                """)
            {
                ContextMemoryItems = [todoItem, todoServiceInterface]
            });

        await csharpGenerator.GenerateRazorComponentAsync(
            new GenerateRazorComponentParameters(
                webProject,
                "Components/Pages/TodoPage",
                """
                A interactive render mode Blazor page with route '/todo' that Injects TodoList.Web.Service.ITodoService and 
                shows a listing of TodoList.Web.Models.TodoItem items.
                Add interactive controls to the bottom of the page to add new todo items by calling the todo service.
                """)
            {
                ContextMemoryItems = [todoItem, todoServiceInterface]
            });
        
        await csharpGenerator.GenerateRazorComponentAsync(
            new GenerateRazorComponentParameters(
                webProject,
                "Components/Pages/Home",
                """
                A Blazor page component
                The page contents should be:
                A basic heading with a creative todo related title.
                A link to "Todo Items" at URL /todo.
                """));

        await commandLine.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                "dotnet run", webProject.RelativeRoot, Interactive: true));
    }
}

