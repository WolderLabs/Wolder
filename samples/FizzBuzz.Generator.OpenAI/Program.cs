using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wolder.Core;
using Wolder.CSharp;
using Wolder.CSharp.OpenAI;
using Wolder.CSharp.OpenAI.Actions;
using Wolder.CommandLine;
using Wolder.CommandLine.Actions;
using Wolder.Core.Workspace;
using Wolder.CSharp.CodeActions;
using Wolder.Interactive.Web;

var builder = Host.CreateApplicationBuilder();
builder.Logging.AddConsole();

var services = builder.Services;

services.AddWolder(builder.Configuration.GetSection("Wolder"));

var host = builder.Build();

await host.Services.GetRequiredService<GeneratorWorkspaceBuilder>()
    .AddCommandLineActions()
    .AddCSharpGeneration()
    .AddInteractiveWebServer()
    .BuildWorkspaceAndRunAsync<GenerateFizzBuzz>("FizzBuzz.OpenAI.Output");

class GenerateFizzBuzz(
    CommandLineActions commandLine,
    CSharpActions csharp,
    CSharpGenerator csharpGenerator) : IVoidAction
{
    public async Task InvokeAsync()
    {
        await csharp.CreateSdkGlobalAsync(
            new CreateSdkGlobalParameters(DotNetSdkVersion.Net8));
        
        var mainProject = new DotNetProjectReference("FizzBuzz/FizzBuzz.csproj", "FizzBuzz");
        
        await commandLine.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                $"dotnet new console -n {mainProject.Name}"));

        await csharpGenerator.GenerateClassAsync(
            new GenerateClassParameters(
                mainProject,
                "",
                "Program",
                "A main method that implements the common fizz buzz app."));

        await commandLine.ExecuteCommandLineAsync(
            new ExecuteCommandLineParameters(
                "dotnet run", mainProject.RelativeRoot));
    }
}