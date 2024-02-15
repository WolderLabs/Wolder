using System.Collections.Generic;
using System.Linq;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Text;

namespace Wolder.Core.Tools;

[Generator]
public class TypedActionCollectionGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var classDeclarations = context.SyntaxProvider
            .CreateSyntaxProvider(
                predicate: static (s, _) => s is ClassDeclarationSyntax { AttributeLists.Count: > 0 },
                transform: static (ctx, _) => ctx.Node as ClassDeclarationSyntax)
            .Where(static m => m is not null);

        var compilationAndClasses = context.CompilationProvider
            .Combine(classDeclarations.Collect());

        context.RegisterSourceOutput(compilationAndClasses, (spc, source) =>
        {
            var (compilation, classes) = source;
            if (classes.IsDefaultOrEmpty) return;

            foreach (var classDeclaration in classes)
            {
                if (classDeclaration is null) continue;
                
                var model = compilation.GetSemanticModel(classDeclaration.SyntaxTree);
                var classSymbol = model.GetDeclaredSymbol(classDeclaration);
                if (classSymbol is null) continue;

                var generateActionCallAttributes = classSymbol.GetAttributes().Where(attr =>
                    attr.AttributeClass?.Name == "GenerateActionCallAttribute")
                    .Select(a => a.AttributeClass?.TypeArguments.FirstOrDefault())
                    .Where(t => t is not null)
                    .Cast<ITypeSymbol>()
                    .ToList();
                if (generateActionCallAttributes.Any())
                {
                    var sourceText = GeneratePartialClassSource(classSymbol, generateActionCallAttributes);
                    spc.AddSource($"{classSymbol.Name}.g.cs", SourceText.From(sourceText, Encoding.UTF8));
                }
            }
        });
    }

    private string GeneratePartialClassSource(INamedTypeSymbol classSymbol, List<ITypeSymbol> actions)
    {
        var actionCalls = actions.Select(BuildCallFromAction)
            .Where(c => c.HasValue)
            .ToList();
        
        // TODO: FileMemoryItem's namespace is not being included in the type name
        return $$"""
            using System;
            using Wolder.Core.Workspace;
            using Wolder.Core.Files;

            namespace {{classSymbol.ContainingNamespace.ToDisplayString()}};
            
            public partial class {{classSymbol.Name}} : ITypedActionCollection
            {
                private readonly IInvoke _invoke;
                public {{classSymbol.Name}}(IInvoke invoke)
                {
                    _invoke = invoke;
                }
                
            {{string.Join("\n\n", actionCalls.Select(c => c?.call))}}
            }
            """;
    }

    private (string declaration, string assignemnt, string call)? BuildCallFromAction(ITypeSymbol classSymbol)
    {
        foreach (var iface in classSymbol.AllInterfaces)
        {
            if (!iface.Name.StartsWith("IInvokable") && !iface.Name.StartsWith("IVoidInvokable"))
            {
                continue;
            }
            var name = iface.ToDisplayString();
            var isInvokable = name.StartsWith("Wolder.Core.Workspace.IInvokable");
            var isVoidInvokable = name.StartsWith("Wolder.Core.Workspace.IVoidInvokable");
            if (isInvokable || isVoidInvokable)
            {
                ITypeSymbol? parametersType = null;
                ITypeSymbol? outputType = null;

                if (isVoidInvokable)
                {
                    if (iface.IsGenericType)
                    {
                        var typeArguments = iface.TypeArguments;
                        if (typeArguments.Length == 1)
                        {
                            parametersType = typeArguments[0];
                        }
                    }
                }
                else
                {
                    if (iface.IsGenericType)
                    {
                        var typeArguments = iface.TypeArguments;
                        if (typeArguments.Length == 1)
                        {
                            outputType = typeArguments[0];
                        }
                        else if (typeArguments.Length == 2)
                        {
                            parametersType = typeArguments[0];
                            outputType = typeArguments[1];
                        }
                    }
                }

                // Assuming only one IInvokable per class
                return GenerateCall(classSymbol, parametersType, outputType);
            }
        }

        return null;
    }
    
    private static (string declaration, string assignemnt, string call)? GenerateCall(
        ITypeSymbol actionClassSymbol, 
        ITypeSymbol? parametersType, 
        ITypeSymbol? outputType
        )
    {
         var parametersTypeName = parametersType?.ToDisplayString();
         var outputTypeName = outputType?.ToDisplayString();
         var actionName = actionClassSymbol.Name;
         var fullActionName = actionClassSymbol.ToDisplayString();

         var builder = new StringBuilder();

         if (parametersTypeName is null && outputTypeName is null)
         {
             return (
                 $"IInvokeVoid<{fullActionName}> {actionName}",
                 $"this.{actionName} = {actionName}",
                 $$"""
                     public async Task {{actionName}}Async()
                     {
                         await _invoke.InvokeVoidAsync<{{fullActionName}}>()
                     }
                 """);
         }
         else if (parametersTypeName is not null && outputTypeName is null)
         {
             return (
                 $"IInvokeVoid<{fullActionName}, {parametersTypeName}> {actionName}",
                 $"this.{actionName} = {actionName}",
                 $$"""
                     public async Task {{actionName}}Async(
                         {{parametersTypeName}} parameters)
                     {
                         await _invoke.InvokeVoidAsync<{{fullActionName}}, {{parametersTypeName}}>(parameters);
                     }
                 """);
         }
         else if (parametersTypeName is null && outputTypeName is not null)
         {
             return (
                 $"IInvoke<{fullActionName}, {outputTypeName}> {actionName}",
                 $"this.{actionName} = {actionName}",
                 $$"""
                     public async Task<{{outputTypeName}}> 
                         {{actionName}}Async()
                     {
                         return await _invoke.InvokeAsync<{{fullActionName}}, {{outputTypeName}}>();
                     }
                 """);
         }
         else
         {
             return (
                 $"IInvoke<{fullActionName}, {parametersTypeName}, {outputTypeName}> {actionName}",
                 $"this.{actionName} = {actionName}",
                 $$"""
                     public async Task<{{outputTypeName}}> 
                         {{actionName}}Async(
                             {{parametersTypeName}} parameters)
                     {
                         return await _invoke.InvokeAsync<{{fullActionName}}, {{parametersTypeName}}, {{outputTypeName}}>(parameters);
                     }
                 """);
         }
    }
}
